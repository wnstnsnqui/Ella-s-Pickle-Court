-- Spec 0016, build plan task 3: refunds owed.
--
-- A refund is owed when a manager turns down or cancels a booking with the
-- refund box ticked (task 2), or when a player's payment arrives after their
-- hold lapsed and a slot was gone (spec 0015, AC-13): the booking stays
-- `expired`, but it now says the venue owes the money back. Either way it
-- stays under Refunds owed until an owner, admin or superadmin records it as
-- refunded or as not owed (AC-12, AC-13).

-- ---------------------------------------------------------------------------
-- Paid after the hold, slot lost (AC-13)
-- ---------------------------------------------------------------------------

-- A trigger rather than a restated `submit_online_booking`, so spec 0015's
-- hold, retake and race logic stays untouched.
create or replace function public.booking_refund_owed_on_late_submit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.submitted_at is null
     and new.submitted_at is not null
     and new.status = 'expired'
     and new.refund_status is null then
    new.refund_status := 'owed';
  end if;
  return new;
end;
$$;

revoke execute on function public.booking_refund_owed_on_late_submit()
  from public, anon, authenticated;

create trigger booking_refund_owed_on_late_submit
  before update on public.booking
  for each row execute function public.booking_refund_owed_on_late_submit();

-- Every payment that already arrived too late.
update public.booking
   set refund_status = 'owed'
 where status = 'expired'
   and submitted_at is not null
   and refund_status is null;

-- ---------------------------------------------------------------------------
-- settle_online_refund (AC-12, AC-14)
-- ---------------------------------------------------------------------------

-- `refunded` records the amount sent back (more than 0, up to 99,999.99) and
-- an optional note; `not_owed` needs a note saying why. Both are final.
create or replace function public.settle_online_refund(
  p_booking_id bigint,
  p_version integer,
  p_outcome text,
  p_amount numeric,
  p_note text
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
     or p_outcome is null
     or p_outcome not in ('refunded', 'not_owed')
     or (p_outcome = 'refunded'
         and (p_amount is null or p_amount <= 0 or p_amount > 99999.99
              or p_amount <> round(p_amount, 2)))
     or (p_outcome = 'not_owed' and v_note is null)
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

  if v_booking.refund_status is distinct from 'owed' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_state');
  end if;

  if p_outcome = 'refunded' then
    update public.booking
       set refund_status = 'refunded',
           refund_amount = p_amount,
           refunded_at = now(),
           refunded_by = v_staff,
           changed_by = v_staff,
           version = version + 1
     where id = p_booking_id;

    insert into public.booking_event (booking_id, kind, note, amount, staff_id)
    values (p_booking_id, 'refunded', v_note, p_amount, v_staff);
  else
    update public.booking
       set refund_status = 'not_owed',
           changed_by = v_staff,
           version = version + 1
     where id = p_booking_id;

    insert into public.booking_event (booking_id, kind, note, staff_id)
    values (p_booking_id, 'refund_not_owed', v_note, v_staff);
  end if;

  return jsonb_build_object(
    'ok', true,
    'version', v_booking.version + 1,
    'previous_status', v_booking.status,
    'submitted_at', v_booking.submitted_at,
    'decided_at', now()
  );
end;
$$;

comment on function public.settle_online_refund(bigint, integer, text, numeric, text) is
  'Settles a refund owed on an online booking: refunded (with the amount) or not_owed (with a note), each with one booking_event. Owners, admins and superadmins only, checked inside. Spec 0016, AC-12.';

revoke execute on function public.settle_online_refund(bigint, integer, text, numeric, text)
  from public, anon;
grant execute on function public.settle_online_refund(bigint, integer, text, numeric, text)
  to authenticated;
