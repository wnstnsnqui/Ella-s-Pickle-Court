-- Spec 0015, build plan task 4: the hold's life.
--
-- A hold ends one of three ways, and every one ends in `expired` through
-- `private.expire_online_booking()`, which cancels the rows (so the slots free
-- on both boards through the ordinary broadcast) and leaves `hold_expires_at`
-- as it was:
--   * the player closes the sheet: `release_online_booking` (AC-15);
--   * nobody comes back: `expire_online_holds()`, every minute (AC-16);
--   * a newer hold overlaps a lapsed one: the cleanup inside
--     `hold_online_booking`, already in place since task 1.
-- `changed_by` stays null on every one, so `cancelled_by` does too, which is
-- how the report's day list tells these apart from a staff cancel (AC-16).

-- ---------------------------------------------------------------------------
-- release_online_booking (AC-15)
-- ---------------------------------------------------------------------------

-- The sheet's own `submission_id` is the capability. Only a live, unsubmitted
-- hold is released: once the player has confirmed (or confirmed too late and
-- is owed a refund) closing the sheet changes nothing.
create or replace function public.release_online_booking(p_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking_id bigint;
begin
  if p_submission_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select b.id into v_booking_id
    from public.booking b
   where b.submission_id = p_submission_id
     and b.status = 'held'
     and b.submitted_at is null
     for update;

  if not found then
    return jsonb_build_object('ok', true, 'released', false);
  end if;

  perform private.expire_online_booking(v_booking_id);
  return jsonb_build_object('ok', true, 'released', true);
end;
$$;

comment on function public.release_online_booking(uuid) is
  'Ends a live, unsubmitted hold when the player closes the checkout: the booking reads expired and its rows are cancelled. Executable by online_booking only. Spec 0015, AC-15.';

-- Invariant 6: the online booking functions belong to `online_booking` alone.
revoke execute on function public.release_online_booking(uuid) from public, anon, authenticated;
grant execute on function public.release_online_booking(uuid) to online_booking;

-- ---------------------------------------------------------------------------
-- expire_online_holds, every minute (AC-16)
-- ---------------------------------------------------------------------------

-- Every `held` booking past its time. `skip locked` leaves any booking a
-- player's own call is working on right now (a submit taking it to
-- `pending_check`, a hold editing it) to that call; the next minute's run
-- picks it up if it is still held.
create or replace function public.expire_online_holds()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking_id bigint;
  v_count integer := 0;
begin
  for v_booking_id in
    select b.id
      from public.booking b
     where b.status = 'held'
       and b.hold_expires_at <= now()
       for update skip locked
  loop
    perform private.expire_online_booking(v_booking_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

comment on function public.expire_online_holds() is
  'Ends every held online booking past its hold_expires_at: expired, rows cancelled, the expiry kept. Run every minute by pg_cron, never reachable over the API. Spec 0015, AC-16.';

-- Not reachable over the API at all. `pg_cron` runs it as `postgres`, which
-- owns it.
revoke execute on function public.expire_online_holds() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'expire_online_holds') then
    perform cron.unschedule('expire_online_holds');
  end if;
  perform cron.schedule(
    'expire_online_holds',
    '* * * * *',
    'select public.expire_online_holds();'
  );
end;
$$;
