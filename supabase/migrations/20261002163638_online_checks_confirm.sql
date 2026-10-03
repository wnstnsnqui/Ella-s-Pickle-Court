-- Spec 0016, build plan task 1: the thin thread of the staff check.
--
-- Staff see every online booking waiting for its payment check, and an owner,
-- admin or superadmin confirms it. Postgres decides who may: `authenticated`
-- gains no write grant on `booking` or `booking_event`, so the only staff
-- write path is a `security definer` function that checks `private.is_owner()`
-- itself, guards on the booking's `version`, and leaves exactly one
-- `booking_event` (invariants 1 and 5). Turn down, cancel and the refunds land
-- with tasks 2 and 3, on the columns and the table this file adds.

-- ---------------------------------------------------------------------------
-- booking: refunds owed and paid back (invariant 6)
-- ---------------------------------------------------------------------------

alter table public.booking
  add column refund_status text,
  add column refund_amount numeric(10, 2),
  add column refunded_at   timestamptz,
  add column refunded_by   text references public.staff (user_id),
  add constraint booking_refund_status_check
    check (refund_status is null or refund_status in ('owed', 'refunded', 'not_owed')),
  add constraint booking_refund_amount_check
    check (refund_amount is null or refund_amount > 0),
  -- The three refund fields are set exactly when the money went back.
  add constraint booking_refunded_check
    check (
      (refund_status is not distinct from 'refunded')
        = (refunded_at is not null)
      and (refunded_at is null) = (refunded_by is null)
      and (refunded_at is null) = (refund_amount is null)
    );

comment on column public.booking.refund_status is
  'Null when no refund question applies; owed, then refunded or not_owed. Written only by the decision functions and the paid after hold trigger. Spec 0016.';

create index booking_refunded_by_idx on public.booking (refunded_by);

-- The two sections of the staff list (AC-2), each a handful of rows at most.
create index booking_pending_check_idx on public.booking (status, id)
  where status = 'pending_check';
create index booking_refund_owed_idx on public.booking (refund_status, id)
  where refund_status = 'owed';

-- ---------------------------------------------------------------------------
-- booking_event: who decided what, append only (AC-6, invariant 5)
-- ---------------------------------------------------------------------------

create table public.booking_event (
  id          bigint generated always as identity primary key,
  booking_id  bigint not null references public.booking (id),
  kind        text not null,
  reason      text,
  -- Cleared by the 90 day details purge (AC-18), so "required for Other" and
  -- "required for No refund needed" are checked by the functions that write
  -- it, never here: a check here would refuse the purge.
  note        text,
  refund_owed boolean,
  amount      numeric(10, 2),
  staff_id    text not null references public.staff (user_id),
  created_at  timestamptz not null default now(),
  constraint booking_event_kind_check
    check (kind in ('confirmed', 'rejected', 'cancelled', 'refunded', 'refund_not_owed')),
  constraint booking_event_reason_check
    check (
      case kind
        when 'rejected' then reason in
          ('no_payment', 'amount_mismatch', 'reference_mismatch', 'invalid_proof', 'other')
        when 'cancelled' then reason in
          ('player_asked', 'payment_reversed', 'venue_issue', 'other')
        else reason is null
      end
    ),
  constraint booking_event_note_check
    check (note is null or (note = btrim(note) and length(note) between 1 and 200)),
  constraint booking_event_refund_owed_check
    check ((refund_owed is not null) = (kind in ('rejected', 'cancelled'))),
  constraint booking_event_amount_check
    check ((amount is not null) = (kind = 'refunded') and (amount is null or amount > 0))
);

comment on table public.booking_event is
  'One line per staff decision on an online booking: confirm, turn down, cancel, refund. Written only by the decision functions, never updated or deleted (the 90 day note clear aside). Spec 0016.';

create index booking_event_booking_id_created_at_idx
  on public.booking_event (booking_id, created_at);
create index booking_event_staff_id_idx on public.booking_event (staff_id);

alter table public.booking_event enable row level security;

-- New tables in `public` arrive with full privileges for anon and
-- authenticated on this project, so the whole default goes first.
revoke all on public.booking_event from public, anon, authenticated;
grant select on public.booking_event to authenticated;

create policy "active staff may read every booking event"
  on public.booking_event for select to authenticated
  using ((select private.is_active_staff()));

-- ---------------------------------------------------------------------------
-- The screenshot, for staff (AC-17)
-- ---------------------------------------------------------------------------

-- Select is what `createSignedUrl` needs. Every active staff member may open a
-- payment screenshot (the engineer's choice, spec 0016 security model); the
-- URL lasts 5 minutes and is made with their own token.
create policy "active staff may read payment proofs"
  on storage.objects for select to authenticated
  using (bucket_id = 'payment-proof' and (select private.is_active_staff()));

-- ---------------------------------------------------------------------------
-- confirm_online_booking (AC-7, AC-14, AC-15)
-- ---------------------------------------------------------------------------

-- Answers `{ ok: true, version, previous_status, submitted_at }` or
-- `{ ok: false, reason }`, never an exception for a business refusal. The
-- owner check comes first, so a plain staff token learns nothing about the
-- booking. `online_checks.decision` marks this booking for the rest of the
-- transaction, which is what lets its rows change past the guard trigger
-- (task 2).
create or replace function public.confirm_online_booking(p_booking_id bigint, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff text := (select auth.jwt() ->> 'sub');
  v_booking public.booking;
begin
  if not (select private.is_owner()) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if p_booking_id is null or p_version is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select * into v_booking
    from public.booking b
   where b.id = p_booking_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_booking.version <> p_version then
    return jsonb_build_object('ok', false, 'reason', 'stale');
  end if;

  if v_booking.status <> 'pending_check' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_state');
  end if;

  perform set_config('online_checks.decision', p_booking_id::text, true);

  update public.booking
     set status = 'confirmed',
         decided_at = now(),
         decided_by = v_staff,
         changed_by = v_staff,
         version = version + 1
   where id = p_booking_id;

  -- Invariant 4: a confirmed booking's active rows all read paid.
  update public.reservation
     set payment_status = 'paid',
         changed_by = v_staff,
         version = version + 1
   where booking_id = p_booking_id
     and status = 'active'
     and payment_status <> 'paid';

  insert into public.booking_event (booking_id, kind, staff_id)
  values (p_booking_id, 'confirmed', v_staff);

  return jsonb_build_object(
    'ok', true,
    'version', v_booking.version + 1,
    'previous_status', v_booking.status,
    'submitted_at', v_booking.submitted_at,
    'decided_at', now()
  );
end;
$$;

comment on function public.confirm_online_booking(bigint, integer) is
  'Confirms an online booking''s payment: the booking reads confirmed, its active rows read paid, and one booking_event is written. Owners, admins and superadmins only, checked inside. Spec 0016, AC-7.';

revoke execute on function public.confirm_online_booking(bigint, integer) from public, anon;
grant execute on function public.confirm_online_booking(bigint, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- booking_changed, on the schedule topic (AC-5, invariant 9)
-- ---------------------------------------------------------------------------

-- Only the id rides the broadcast: `anon` may read this topic, and an id says
-- nothing personal. The public boards ignore the event.
create or replace function public.booking_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.id),
    'booking_changed',
    'schedule',
    true
  );
  return null;
end;
$$;

revoke execute on function public.booking_broadcast() from public, anon, authenticated;

create trigger booking_broadcast_insert
  after insert on public.booking
  for each row execute function public.booking_broadcast();

-- The nightly purges and the contact copy change neither column, so they
-- send nothing.
create trigger booking_broadcast_update
  after update on public.booking
  for each row
  when (old.status is distinct from new.status
        or old.refund_status is distinct from new.refund_status)
  execute function public.booking_broadcast();
