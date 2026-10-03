-- Spec 0016, build plan task 2 (and the contact copy of task 4): turn down,
-- cancel, and the row guard.
--
-- An online booking and its reservation rows must never drift apart. The
-- guard trigger below holds that for every caller, whatever path they take:
-- while a booking is `held`, `pending_check` or `confirmed`, none of its rows
-- may be cancelled and none may change `payment_status` or `amount`, unless a
-- decision function has marked that booking for this transaction with
-- `online_checks.decision` (invariants 2 and 7). `booking_id` never changes
-- after insert, on any row. The functions set the mark with
-- `set_config(…, true)`, so it is gone at commit, and PostgREST exposes no
-- way for a caller to set it.
--
-- The same trigger copies a staff name or phone edit on an online row to the
-- booking and to its other active rows (AC-11). The copy sets `changed_by`
-- and lets `updated_at` move, but never the booking's `version`, so a contact
-- fix never makes a manager's pending decision come back stale.

-- ---------------------------------------------------------------------------
-- guard_online_reservation (AC-11, AC-15)
-- ---------------------------------------------------------------------------

create or replace function public.guard_online_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if new.booking_id is distinct from old.booking_id then
    raise exception 'online_booking_guard: a row''s booking is set when it is made and never changes'
      using errcode = '23514';
  end if;

  if new.booking_id is null then
    return new;
  end if;

  if (old.status = 'active' and new.status = 'cancelled')
     or new.payment_status is distinct from old.payment_status
     or new.amount is distinct from old.amount then
    if current_setting('online_checks.decision', true) is distinct from new.booking_id::text then
      select b.status into v_status
        from public.booking b
       where b.id = new.booking_id;

      if v_status in ('held', 'pending_check', 'confirmed') then
        raise exception 'online_booking_guard: this is an online booking, change it through its own decision'
          using errcode = '23514';
      end if;
    end if;
  end if;

  -- A staff edit only: the hold's own detail edit (as `online_booking`) and
  -- the nightly phone purge (no token at all) already write every row they
  -- mean to, and copying under them would touch rows their own statement is
  -- about to update. `pg_trigger_depth()` stops the sibling updates below
  -- from copying again.
  if pg_trigger_depth() = 1
     and (select auth.jwt() ->> 'role') = 'authenticated'
     and (new.customer_name is distinct from old.customer_name
          or new.customer_phone is distinct from old.customer_phone) then
    update public.booking b
       set customer_name = new.customer_name,
           customer_phone = new.customer_phone,
           changed_by = new.changed_by
     where b.id = new.booking_id
       and (b.customer_name is distinct from new.customer_name
            or b.customer_phone is distinct from new.customer_phone);

    update public.reservation r
       set customer_name = new.customer_name,
           customer_phone = new.customer_phone,
           changed_by = new.changed_by,
           version = r.version + 1
     where r.booking_id = new.booking_id
       and r.id <> new.id
       and r.status = 'active'
       and (r.customer_name is distinct from new.customer_name
            or r.customer_phone is distinct from new.customer_phone);
  end if;

  return new;
end;
$$;

comment on function public.guard_online_reservation() is
  'Refuses to cancel, repay or reprice a row of a held, pending_check or confirmed online booking outside its own decision function, refuses any booking_id change, and copies a staff contact edit to the booking and its other rows. Spec 0016, AC-11, AC-15.';

revoke execute on function public.guard_online_reservation() from public, anon, authenticated;

create trigger reservation_guard_online
  before update on public.reservation
  for each row execute function public.guard_online_reservation();

-- ---------------------------------------------------------------------------
-- Turn down and cancel (AC-8, AC-10, invariants 3 and 7a)
-- ---------------------------------------------------------------------------

-- The two decisions differ only in the state they end in and their reasons,
-- so one private body does both. Rows already played stay as they happened;
-- every row not yet ended is cancelled with the deciding staff member in
-- `changed_by`, so `cancelled_by` is stamped and the usage report reads it as
-- a staff cancel.
create or replace function private.end_online_booking(
  p_booking_id bigint,
  p_version integer,
  p_status text,
  p_reason text,
  p_note text,
  p_refund_owed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff text := (select auth.jwt() ->> 'sub');
  v_note text := nullif(btrim(p_note), '');
  v_booking public.booking;
begin
  if not (select private.is_owner()) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if p_booking_id is null
     or p_version is null
     or p_refund_owed is null
     or p_status not in ('rejected', 'cancelled')
     or p_reason is null
     or (p_status = 'rejected' and p_reason not in
          ('no_payment', 'amount_mismatch', 'reference_mismatch', 'invalid_proof', 'other'))
     or (p_status = 'cancelled' and p_reason not in
          ('player_asked', 'payment_reversed', 'venue_issue', 'other'))
     or (p_reason = 'other' and v_note is null)
     or length(v_note) > 200 then
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

  if v_booking.status not in ('pending_check', 'confirmed') then
    return jsonb_build_object('ok', false, 'reason', 'wrong_state');
  end if;

  perform set_config('online_checks.decision', p_booking_id::text, true);

  update public.booking
     set status = p_status,
         decided_at = now(),
         decided_by = v_staff,
         changed_by = v_staff,
         refund_status = case when p_refund_owed then 'owed' else refund_status end,
         version = version + 1
   where id = p_booking_id;

  update public.reservation
     set status = 'cancelled',
         changed_by = v_staff,
         version = version + 1
   where booking_id = p_booking_id
     and status = 'active'
     and ends_at > now();

  insert into public.booking_event (booking_id, kind, reason, note, refund_owed, staff_id)
  values (p_booking_id, p_status, p_reason, v_note, p_refund_owed, v_staff);

  return jsonb_build_object(
    'ok', true,
    'version', v_booking.version + 1,
    'previous_status', v_booking.status,
    'submitted_at', v_booking.submitted_at,
    'decided_at', now()
  );
end;
$$;

revoke execute on function private.end_online_booking(bigint, integer, text, text, text, boolean)
  from public, anon, authenticated;

create or replace function public.reject_online_booking(
  p_booking_id bigint,
  p_version integer,
  p_reason text,
  p_note text,
  p_refund_owed boolean
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.end_online_booking(p_booking_id, p_version, 'rejected', p_reason, p_note, p_refund_owed);
$$;

comment on function public.reject_online_booking(bigint, integer, text, text, boolean) is
  'Turns an online booking''s payment down: the booking reads rejected, its rows not yet ended are cancelled, a refund is marked owed when asked, and one booking_event is written. Owners, admins and superadmins only, checked inside. Spec 0016, AC-8.';

create or replace function public.cancel_online_booking(
  p_booking_id bigint,
  p_version integer,
  p_reason text,
  p_note text,
  p_refund_owed boolean
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.end_online_booking(p_booking_id, p_version, 'cancelled', p_reason, p_note, p_refund_owed);
$$;

comment on function public.cancel_online_booking(bigint, integer, text, text, boolean) is
  'Cancels a whole online booking: the booking reads cancelled, its rows not yet ended are cancelled, a refund is marked owed when asked, and one booking_event is written. Owners, admins and superadmins only, checked inside. Spec 0016, AC-10.';

revoke execute on function public.reject_online_booking(bigint, integer, text, text, boolean)
  from public, anon;
revoke execute on function public.cancel_online_booking(bigint, integer, text, text, boolean)
  from public, anon;
grant execute on function public.reject_online_booking(bigint, integer, text, text, boolean)
  to authenticated;
grant execute on function public.cancel_online_booking(bigint, integer, text, text, boolean)
  to authenticated;
