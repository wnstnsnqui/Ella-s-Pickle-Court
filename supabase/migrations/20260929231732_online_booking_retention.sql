-- Spec 0015, build plan task 7: how long online booking details are kept (AC-23).
--
-- Two nightly jobs, beside the phone purge (spec 0010) at 03:00 in Manila:
--
-- 1. `purge_online_booking_details()` clears the phone, email and reference
--    digits from `booking` 90 days after its last slot ends, and the client
--    hash one day after the booking was made. Plain SQL, run by `pg_cron`.
-- 2. The payment screenshots. A Storage object cannot be deleted with SQL
--    (Storage refuses a direct delete on `storage.objects`, and a row deleted
--    that way would leave the file behind anyway), so `pg_cron` asks the
--    `purge-payment-proofs` Edge Function through `pg_net`. The function reads
--    `payment_proofs_due()`, deletes through the Storage API, then calls
--    `forget_payment_proofs()` to set `proof_path` null.
--
-- Every number below is also a constant in `lib/legal/constants.ts`, printed
-- on `/privacy`; `supabase/tests/online_booking_retention.test.ts` seeds each
-- boundary from those constants, so the page and this file cannot drift
-- (invariant 8).
--
-- Out of band, once per project (never in a migration, because they are
-- secrets): two Vault secrets, `project_url` and `proof_purge_secret`, and the
-- same `PROOF_PURGE_SECRET` set on the Edge Function. Until they exist the
-- nightly request is skipped with a warning, never sent half configured.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- The details purge
-- ---------------------------------------------------------------------------

-- The reservation rows' own phone copies are already cleared by
-- `purge_customer_phones()` at the same age; this clears the header's.
-- `changed_by` stays null (a schedule acted, nobody signed in) and `version`
-- moves, so a staff write guarded on the old version refetches rather than
-- writing back what was just cleared.
create or replace function public.purge_online_booking_details()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_details integer;
  v_hashes  integer;
begin
  -- EMAIL_RETENTION_DAYS, REFERENCE_RETENTION_DAYS and PHONE_RETENTION_DAYS,
  -- all 90, counted from the end of the booking's last slot (any status: an
  -- expired booking's rows are cancelled but still say when it would have ended).
  with last_end as (
    select r.booking_id, max(r.ends_at) as ends_at
      from public.reservation r
     where r.booking_id is not null
     group by r.booking_id
  )
  update public.booking b
     set customer_phone = null,
         customer_email = null,
         reference_last4 = null,
         version = b.version + 1,
         changed_by = null
    from last_end l
   where l.booking_id = b.id
     and l.ends_at < now() - interval '90 days'
     and (b.customer_phone is not null
          or b.customer_email is not null
          or b.reference_last4 is not null);
  get diagnostics v_details = row_count;

  -- CLIENT_HASH_RETENTION_DAYS, 1. The rate limit only ever looks back 15
  -- minutes, so clearing it a day on changes no answer.
  update public.booking
     set client_hash = null,
         version = version + 1,
         changed_by = null
   where client_hash is not null
     and created_at < now() - interval '1 day';
  get diagnostics v_hashes = row_count;

  return v_details + v_hashes;
end;
$$;

comment on function public.purge_online_booking_details() is
  'Clears customer_phone, customer_email and reference_last4 from booking 90 days after its last slot ends, and client_hash a day after it was made. Spec 0015, AC-23. Run nightly by pg_cron, never reachable over the API.';

revoke execute on function public.purge_online_booking_details() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The proof purge's two database halves
-- ---------------------------------------------------------------------------

-- Which screenshots are due. A booking's proof path is set at the hold, before
-- any upload, so a screenshot that was never confirmed is found the same way
-- as one that was (invariant 3b); deleting a path with no object behind it is
-- harmless. The three rules, in `lib/legal/constants.ts` order:
--   PROOF_RETENTION_DAYS_AFTER_DECISION (30) after staff decided (feature 17);
--   PROOF_RETENTION_DAYS_UNCHECKED (90) after the last slot ends, submitted but never decided;
--   PROOF_RETENTION_DAYS_UNSUBMITTED (1) after the hold, never submitted.
create or replace function public.payment_proofs_due(p_limit integer default 100)
returns table (booking_id bigint, proof_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.proof_path
    from public.booking b
    left join lateral (
      select max(r.ends_at) as ends_at
        from public.reservation r
       where r.booking_id = b.id
    ) l on true
   where b.proof_path is not null
     and (
       (b.decided_at is not null
          and b.decided_at < now() - interval '30 days')
       or (b.decided_at is null and b.submitted_at is not null
          and l.ends_at < now() - interval '90 days')
       or (b.submitted_at is null
          and coalesce(b.hold_expires_at, b.created_at) < now() - interval '1 day')
     )
   order by b.id
   limit greatest(1, least(p_limit, 1000));
$$;

comment on function public.payment_proofs_due(integer) is
  'The payment screenshots due for deletion, oldest booking first. Read by the purge-payment-proofs Edge Function with the service role. Spec 0015, AC-23.';

-- After the Storage delete succeeded: forget the paths. Keyed on the path
-- (unique), so only a booking still pointing at a deleted object is touched.
create or replace function public.forget_payment_proofs(p_paths text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.booking
     set proof_path = null,
         version = version + 1,
         changed_by = null
   where proof_path = any(p_paths);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.forget_payment_proofs(text[]) is
  'Sets proof_path null on the bookings whose screenshots the purge-payment-proofs Edge Function just deleted. Spec 0015, AC-23.';

-- Only the Edge Function, which runs with the service role inside Supabase.
revoke execute on function public.payment_proofs_due(integer) from public, anon, authenticated;
revoke execute on function public.forget_payment_proofs(text[]) from public, anon, authenticated;
grant execute on function public.payment_proofs_due(integer) to service_role;
grant execute on function public.forget_payment_proofs(text[]) to service_role;

-- ---------------------------------------------------------------------------
-- The nightly request to the Edge Function
-- ---------------------------------------------------------------------------

-- Reads the project URL and the shared secret from Vault at run time, so no
-- secret sits in `cron.job`. `pg_net` is asynchronous: this queues the
-- request and returns its id; the answer lands in `net._http_response`.
create or replace function private.request_payment_proof_purge()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'proof_purge_secret';

  if v_url is null or v_secret is null then
    raise warning 'purge-payment-proofs skipped: set the project_url and proof_purge_secret Vault secrets';
    return null;
  end if;

  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/purge-payment-proofs',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-purge-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

comment on function private.request_payment_proof_purge() is
  'Asks the purge-payment-proofs Edge Function to delete the screenshots that are due. Run nightly by pg_cron. Spec 0015, AC-23.';

revoke execute on function private.request_payment_proof_purge() from public, anon, authenticated;

-- `pg_cron` runs in UTC on Supabase: 19:05 and 19:10 UTC are 03:05 and 03:10
-- in Asia/Manila, just after the phone purge at 19:00.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge_online_booking_details') then
    perform cron.unschedule('purge_online_booking_details');
  end if;
  perform cron.schedule(
    'purge_online_booking_details',
    '5 19 * * *',
    'select public.purge_online_booking_details();'
  );

  if exists (select 1 from cron.job where jobname = 'purge_payment_proofs') then
    perform cron.unschedule('purge_payment_proofs');
  end if;
  perform cron.schedule(
    'purge_payment_proofs',
    '10 19 * * *',
    'select private.request_payment_proof_purge();'
  );
end;
$$;
