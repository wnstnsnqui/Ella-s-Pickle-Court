-- Spec 0016, invariant 7: the row guard's mark lasts exactly as long as the
-- decision that set it.
--
-- `confirm_online_booking` and the turn down and cancel body set
-- `online_checks.decision` local to the transaction. Through the API every
-- call is its own transaction, so the mark was already gone at commit; but a
-- longer transaction (a database test, a later function that calls one of
-- these) could change that booking's rows past the guard after the decision
-- returned. Each function now clears the mark as its last write. The bodies
-- are otherwise unchanged; grants are kept because the signatures are.

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

  -- The mark ends with the decision, not the transaction, so nothing later in
  -- the same transaction can ride on it.
  perform set_config('online_checks.decision', '', true);

  return jsonb_build_object(
    'ok', true,
    'version', v_booking.version + 1,
    'previous_status', v_booking.status,
    'submitted_at', v_booking.submitted_at,
    'decided_at', now()
  );
end;
$$;

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

  -- The mark ends with the decision, not the transaction, so nothing later in
  -- the same transaction can ride on it.
  perform set_config('online_checks.decision', '', true);

  return jsonb_build_object(
    'ok', true,
    'version', v_booking.version + 1,
    'previous_status', v_booking.status,
    'submitted_at', v_booking.submitted_at,
    'decided_at', now()
  );
end;
$$;
