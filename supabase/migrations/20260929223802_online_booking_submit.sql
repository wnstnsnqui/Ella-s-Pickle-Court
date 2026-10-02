-- Spec 0015, build plan task 3: Confirm booking.
--
-- `submit_online_booking` turns a hold into a booking waiting for its payment
-- check. The browser sends the sheet's `submission_id` (the capability) and the
-- last 4 digits of the transfer's reference, never a path: the proof must
-- already sit at the path this booking was issued at the hold (invariant 3b).
--
-- Three ways it ends (AC-12, AC-13):
--   * the hold is live: `held` becomes `pending_check`;
--   * the hold has lapsed and every slot is still free and not yet ended: the
--     same slots are taken again, all or nothing, and it is `pending_check`;
--   * the hold has lapsed and a slot is gone: nothing is booked, but the digits
--     and `submitted_at` are kept on the `expired` booking, so staff can find a
--     payment they owe back.
-- Once `submitted_at` is set the proof can no longer be replaced (the storage
-- policies test it), and calling again answers the same way without writing.

-- Every slot a booking last held, one per tile, as `(court_id, starts_at,
-- ends_at)`. The runs are its most recent row per start, as
-- `online_booking_result` reads them; tiles use today's slot length.
create or replace function private.online_booking_tiles(p_booking_id bigint, p_slot interval)
returns table (court_id bigint, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select run.court_id, tile.starts_at, tile.starts_at + p_slot
    from (
      select distinct on (x.court_id, x.starts_at) x.court_id, x.starts_at, x.ends_at
        from public.reservation x
       where x.booking_id = p_booking_id
       order by x.court_id, x.starts_at, (x.status = 'active') desc, x.id desc
    ) run
    cross join lateral generate_series(run.starts_at, run.ends_at - p_slot, p_slot) as tile(starts_at)
$$;

revoke execute on function private.online_booking_tiles(bigint, interval)
  from public, anon, authenticated;

-- The tiles of a lapsed booking that cannot be taken again: somebody holds
-- them, or they have already ended. As `[{ court_id, starts_at }]`.
create or replace function private.online_booking_gone(p_booking_id bigint, p_slot interval)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('court_id', t.court_id, 'starts_at', t.starts_at)
      order by t.starts_at, t.court_id
    ),
    '[]'::jsonb
  )
  from private.online_booking_tiles(p_booking_id, p_slot) t
  where t.ends_at <= now()
     or exists (
          select 1
            from public.reservation r
           where r.status = 'active'
             and r.court_id = t.court_id
             and r.during && tstzrange(t.starts_at, t.ends_at, '[)')
        );
$$;

revoke execute on function private.online_booking_gone(bigint, interval)
  from public, anon, authenticated;

create or replace function public.submit_online_booking(
  p_submission_id uuid,
  p_reference_last4 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_booking public.booking;
  v_slot interval;
  v_gone jsonb;
begin
  if p_submission_id is null
     or p_reference_last4 is null
     or p_reference_last4 !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select * into v_booking
    from public.booking b
   where b.submission_id = p_submission_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select make_interval(mins => s.slot_minutes) into v_slot
    from public.venue_settings s
   where s.id;

  -- Already submitted: the same call again gets the same answer and writes
  -- nothing, so a double tap on Confirm never books twice.
  if v_booking.submitted_at is not null then
    if v_booking.status = 'expired' then
      v_gone := private.online_booking_gone(v_booking.id, v_slot);
      return jsonb_build_object(
        'ok', false,
        'reason', 'slot_taken',
        'slots', v_gone
      );
    end if;
    return private.online_booking_result(v_booking.id)
      || jsonb_build_object('retaken', exists (
           select 1 from public.reservation r
            where r.booking_id = v_booking.id and r.status = 'cancelled'
         ));
  end if;

  if v_booking.status not in ('held', 'expired') then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- The screenshot must already be at the path the hold issued. A purged
  -- proof (path null) counts as missing.
  if v_booking.proof_path is null or not exists (
    select 1
      from storage.objects o
     where o.bucket_id = 'payment-proof'
       and o.name = v_booking.proof_path
  ) then
    return jsonb_build_object('ok', false, 'reason', 'proof_missing');
  end if;

  -- The hold is live: it becomes a booking waiting for its payment check.
  -- `hold_expires_at` stays, as a record of when the hold would have ended.
  if v_booking.status = 'held' and v_booking.hold_expires_at > v_now then
    update public.booking
       set status = 'pending_check',
           reference_last4 = p_reference_last4,
           submitted_at = v_now,
           version = version + 1
     where id = v_booking.id;

    return private.online_booking_result(v_booking.id)
      || jsonb_build_object('retaken', false);
  end if;

  -- The hold has lapsed. If the minute job has not reached it yet, end it
  -- first, so its own rows never stand in the way of taking the slots again.
  if v_booking.status = 'held' then
    perform private.expire_online_booking(v_booking.id);
  end if;

  v_gone := private.online_booking_gone(v_booking.id, v_slot);

  if jsonb_array_length(v_gone) = 0 then
    begin
      -- The retake: fresh rows for the same runs, all or nothing, keeping the
      -- amount the hold worked out (AC-12). The old cancelled rows stay linked.
      insert into public.reservation (
        court_id, kind, status, starts_at, ends_at, customer_name, customer_phone,
        payment_status, amount, created_by, changed_by, booking_id
      )
      select run.court_id, 'booking', 'active', run.starts_at, run.ends_at,
             v_booking.customer_name, v_booking.customer_phone,
             'unpaid', run.amount, null, null, v_booking.id
        from (
          select distinct on (x.court_id, x.starts_at) x.court_id, x.starts_at, x.ends_at, x.amount
            from public.reservation x
           where x.booking_id = v_booking.id
           order by x.court_id, x.starts_at, x.id desc
        ) run;

      update public.booking
         set status = 'pending_check',
             reference_last4 = p_reference_last4,
             submitted_at = v_now,
             version = version + 1
       where id = v_booking.id;

      return private.online_booking_result(v_booking.id)
        || jsonb_build_object('retaken', true);
    exception when exclusion_violation then
      -- Somebody took a slot between the look and the insert. The block has
      -- rolled back whole; look again to name what they took.
      v_gone := private.online_booking_gone(v_booking.id, v_slot);
    end;
  end if;

  -- A slot is gone (AC-13). Nothing is booked, but the player has paid: keep
  -- the digits and the time on the expired booking so staff can refund it.
  update public.booking
     set reference_last4 = p_reference_last4,
         submitted_at = v_now,
         version = version + 1
   where id = v_booking.id;

  return jsonb_build_object('ok', false, 'reason', 'slot_taken', 'slots', v_gone);
end;
$$;

comment on function public.submit_online_booking(uuid, text) is
  'Confirms an online booking: a live hold becomes pending_check; a lapsed one takes its slots again if every one is still free, else keeps the payment digits on the expired booking for a refund. Executable by online_booking only. Spec 0015, AC-12, AC-13.';

-- Invariant 6: the online booking functions belong to `online_booking` alone.
revoke execute on function public.submit_online_booking(uuid, text)
  from public, anon, authenticated;
grant execute on function public.submit_online_booking(uuid, text) to online_booking;
