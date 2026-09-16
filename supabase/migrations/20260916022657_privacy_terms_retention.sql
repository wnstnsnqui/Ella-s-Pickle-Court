-- Spec 0010: the phone retention purge, and the staff privacy acknowledgement.
--
-- Two independent things share this migration because both are the first
-- scheduled work in the system (spec 0001 reserved `pg_cron` for exactly this)
-- and both touch `ensure_staff()`'s return shape, so they land together.

-- ---------------------------------------------------------------------------
-- The nightly purge
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;

-- Clears a customer's phone number 90 days after their booking's scheduled
-- end, from the reservation row and from every audit row that ever recorded
-- it. A CTE collects the purged ids first, so the second statement can redact
-- the same set from `reservation_audit`, including the audit row this update
-- itself just caused (the audit trigger is `after update`, so it has already
-- fired by the time this statement runs).
--
-- `changed_by` is left null on purpose: nobody acted, a schedule did. The
-- audit trigger takes its own `changed_by` from `auth.jwt() ->> 'sub'`, which
-- is null under `pg_cron` (no caller, no token), so the audit row's null and
-- the reservation's null are two different nulls that happen to agree. Do not
-- "fix" the trigger to read `new.changed_by` instead: that would attribute
-- every ordinary staff edit to whoever last purged, not who made the edit.
create or replace function public.purge_customer_phones()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged_ids bigint[];
begin
  with purged as (
    update public.reservation
       set customer_phone = null,
           version = version + 1,
           changed_by = null
     where kind = 'booking'
       and customer_phone is not null
       and ends_at < now() - interval '90 days'
    returning id
  )
  select array_agg(id) into purged_ids from purged;

  if purged_ids is not null then
    update public.reservation_audit
       set old_row = jsonb_set(old_row, '{customer_phone}', 'null'),
           new_row = jsonb_set(new_row, '{customer_phone}', 'null')
     where reservation_id = any(purged_ids);
  end if;

  return coalesce(array_length(purged_ids, 1), 0);
end;
$$;

comment on function public.purge_customer_phones() is
  'Clears customer_phone from reservation and reservation_audit 90 days after a booking''s scheduled end. Spec 0010, AC-5. Run nightly by pg_cron, never reachable over the API.';

-- Not reachable over the API at all. `pg_cron` runs it as `postgres`, which
-- owns the function and needs no grant of its own.
revoke execute on function public.purge_customer_phones() from public, anon, authenticated;

-- `pg_cron` evaluates schedules in UTC on Supabase: 19:00 UTC is 03:00 in
-- Asia/Manila. Registered idempotently so re-running this migration (or a
-- future one that touches the same job) never fails on "job already exists".
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge_customer_phones') then
    perform cron.unschedule('purge_customer_phones');
  end if;
  perform cron.schedule(
    'purge_customer_phones',
    '0 19 * * *',
    $job$select public.purge_customer_phones();$job$
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The staff acknowledgement
-- ---------------------------------------------------------------------------

alter table public.staff
  add column privacy_acknowledged_at timestamptz,
  add column privacy_acknowledged_version text;

comment on column public.staff.privacy_acknowledged_at is
  'When this person last acknowledged the privacy notice. Null until their first acknowledgement. Written only by public.acknowledge_privacy_notice().';
comment on column public.staff.privacy_acknowledged_version is
  'Which PRIVACY_NOTICE_VERSION this person last acknowledged. Compared against the current constant to decide whether the dialog shows again.';

-- A widened `returns table` cannot go through `create or replace`, so the
-- function is dropped and recreated whole. The body is unchanged from
-- 20260913013822_staff_sign_in.sql except the final `select` and the return
-- type; every grant below is restated for the same reason task 1 flags: a
-- missed grant here breaks every staff sign in at once.
drop function public.ensure_staff();

create function public.ensure_staff()
returns table (
  display_name text,
  role text,
  is_active boolean,
  privacy_acknowledged_version text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims jsonb;
  v_sub    text;
  v_name   text;
  v_email  text;
begin
  v_claims := auth.jwt();
  v_sub := v_claims ->> 'sub';
  if v_sub is null then
    raise insufficient_privilege
      using message = 'ensure_staff needs a signed in caller';
  end if;

  v_email := nullif(btrim(v_claims ->> 'email'), '');
  v_name := left(coalesce(nullif(btrim(v_claims ->> 'name'), ''), v_email), 80);
  if v_name is null then
    raise check_violation
      using message = 'the session token carries no name or email; check the Clerk session token claims';
  end if;

  if exists (select 1 from public.staff s where s.clerk_user_id = v_sub) then
    update public.staff s
       set display_name = v_name,
           email = v_email,
           last_signed_in_at = now()
     where s.clerk_user_id = v_sub;
  else
    perform pg_advisory_xact_lock(hashtext('staff_bootstrap'));
    insert into public.staff (clerk_user_id, display_name, email, role, last_signed_in_at)
    values (
      v_sub,
      v_name,
      v_email,
      case when not exists (select 1 from public.staff) then 'owner' else 'staff' end,
      now()
    )
    on conflict (clerk_user_id) do update
      set display_name = excluded.display_name,
          email = excluded.email,
          last_signed_in_at = now();
  end if;

  return query
    select s.display_name, s.role, s.is_active, s.privacy_acknowledged_version
      from public.staff s
     where s.clerk_user_id = v_sub;
end;
$$;

comment on function public.ensure_staff() is
  'Creates or refreshes the calling staff member''s own row from their Clerk token. The first row ever created is the owner. Spec 0004. Widened by spec 0010 to also return privacy_acknowledged_version.';

revoke execute on function public.ensure_staff() from public, anon;
grant execute on function public.ensure_staff() to authenticated;

-- Records that the caller has seen a given notice version. `security definer`
-- because `authenticated` has no update grant on `staff` (and this migration
-- adds none); `set search_path = ''` so nothing on the caller's path can
-- shadow the objects named here; keyed on the caller's own `sub` so nobody can
-- name another row.
create function public.acknowledge_privacy_notice(version text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub text;
  v_stored text;
begin
  v_sub := auth.jwt() ->> 'sub';
  if v_sub is null then
    raise insufficient_privilege
      using message = 'acknowledge_privacy_notice needs a signed in caller';
  end if;

  update public.staff
     set privacy_acknowledged_at = now(),
         privacy_acknowledged_version = version
   where clerk_user_id = v_sub
  returning privacy_acknowledged_version into v_stored;

  if v_stored is null then
    raise no_data_found
      using message = 'no staff row for this caller';
  end if;

  return v_stored;
end;
$$;

comment on function public.acknowledge_privacy_notice(text) is
  'Records that the calling staff member has seen the given privacy notice version. Spec 0010, AC-9.';

revoke execute on function public.acknowledge_privacy_notice(text) from public, anon;
grant execute on function public.acknowledge_privacy_notice(text) to authenticated;

-- Restated: this migration adds no update grant on `staff` for `anon` or
-- `authenticated`. Both functions above write through `security definer`,
-- never through a grant a caller could otherwise use to touch another row.
