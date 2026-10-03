-- Spec 0016, build plan task 5: retention follows refunds (AC-18).
--
-- Two restated functions from spec 0015's retention migration, each with one
-- change and every number as it was (the constants in `lib/legal/constants.ts`
-- still match, pinned by `supabase/tests/online_booking_retention.test.ts`):
--
-- 1. `payment_proofs_due()` keeps every screenshot whose refund is still owed,
--    whatever else applies, and counts its 30 days after a decision from the
--    later of `decided_at` and `refunded_at`. A booking refunded with no
--    decision (paid after the hold) is due 30 days after `refunded_at`.
-- 2. `purge_online_booking_details()` also clears the staff notes on a
--    booking's decisions when it clears the booking's other details, 90 days
--    after its last slot ends.

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
     -- Invariant 8: never while the money is still owed back.
     and b.refund_status is distinct from 'owed'
     and (
       -- PROOF_RETENTION_DAYS_AFTER_DECISION (30), from the latest decision or refund.
       -- `greatest` skips a null, so either one alone counts.
       (greatest(b.decided_at, b.refunded_at) is not null
          and greatest(b.decided_at, b.refunded_at) < now() - interval '30 days')
       -- PROOF_RETENTION_DAYS_UNCHECKED (90), submitted but never decided or refunded.
       or (b.decided_at is null and b.refunded_at is null and b.submitted_at is not null
          and l.ends_at < now() - interval '90 days')
       -- PROOF_RETENTION_DAYS_UNSUBMITTED (1), never submitted.
       or (b.submitted_at is null
          and coalesce(b.hold_expires_at, b.created_at) < now() - interval '1 day')
     )
   order by b.id
   limit greatest(1, least(p_limit, 1000));
$$;

create or replace function public.purge_online_booking_details()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_details integer;
  v_notes   integer;
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

  -- The staff notes on its decisions, at the same age (spec 0016, AC-18).
  with last_end as (
    select r.booking_id, max(r.ends_at) as ends_at
      from public.reservation r
     where r.booking_id is not null
     group by r.booking_id
  )
  update public.booking_event e
     set note = null
    from last_end l
   where l.booking_id = e.booking_id
     and l.ends_at < now() - interval '90 days'
     and e.note is not null;
  get diagnostics v_notes = row_count;

  -- CLIENT_HASH_RETENTION_DAYS, 1. The rate limit only ever looks back 15
  -- minutes, so clearing it a day on changes no answer.
  update public.booking
     set client_hash = null,
         version = version + 1,
         changed_by = null
   where client_hash is not null
     and created_at < now() - interval '1 day';
  get diagnostics v_hashes = row_count;

  return v_details + v_notes + v_hashes;
end;
$$;
