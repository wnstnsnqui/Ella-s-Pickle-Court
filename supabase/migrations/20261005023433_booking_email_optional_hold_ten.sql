-- Spec 0015, amended 2026-10-05: the email on the Details step is optional,
-- and a hold lasts 10 minutes instead of 5.
--
-- `hold_online_booking` is restated whole (same signature, so its grants
-- stand). Two changes only:
--   1. A blank or null `p_email` is stored as null; a given one is still
--      checked for length and shape. `booking.customer_email` already allows
--      null, and the lookup and the receipt already leave a null one out.
--   2. `hold_expires_at` is `now() + 10 minutes`. `expire_online_holds()`
--      and `submit_online_booking` read the column, never the length, so
--      neither changes. A hold taken before this applies keeps its 5 minutes.

create or replace function public.hold_online_booking(
  p_submission_id uuid,
  p_day date,
  p_picks jsonb,
  p_name text,
  p_phone text,
  p_email text,
  p_terms_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_hash text := nullif(auth.jwt() ->> 'client_hash', '');
  v_now timestamptz := now();
  v_name text := btrim(p_name);
  v_phone text := btrim(p_phone);
  -- Optional: blank is no email at all.
  v_email text := nullif(btrim(p_email), '');
  v_existing public.booking;
  v_booking_id bigint;
  v_settings public.venue_settings;
  v_slot interval;
  v_today date;
  v_open time;
  v_close time;
  v_open_at timestamptz;
  v_close_at timestamptz;
  v_courts bigint[];
  v_starts timestamptz[];
  v_count integer;
  v_recent integer;
  v_oldest timestamptz;
  v_lapsed bigint;
  v_taken jsonb;
  v_amount numeric(10, 2);
  v_code text;
begin
  -- Only a token the server minted carries this claim. Without it the rate
  -- limit has nothing to count, so refuse outright.
  if v_client_hash is null then
    raise exception 'hold_online_booking needs the client_hash claim'
      using errcode = '42501';
  end if;

  if p_submission_id is null
     or p_day is null
     or v_name is null or length(v_name) not between 1 and 80
     or v_phone is null or v_phone !~ '^\+639[0-9]{9}$'
     or (v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+$'))
     or p_terms_version is null or length(p_terms_version) not between 1 and 40 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- AC-5: the same sheet calling again (Back to Details, an edit, Next) edits
  -- the details in place. Same code, same expiry: the 10 minutes never restart,
  -- and no new booking counts against the rate limit. A hold that has lapsed
  -- is edited the same way; its Payment step already says the hold ended, and
  -- Confirm retakes the slots if they are still free (AC-10, AC-12).
  select * into v_existing
    from public.booking b
   where b.submission_id = p_submission_id
     for update;

  if found then
    if v_existing.submitted_at is not null then
      return jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;

    update public.booking
       set customer_name = v_name,
           customer_phone = v_phone,
           customer_email = v_email,
           version = version + 1
     where id = v_existing.id;

    update public.reservation
       set customer_name = v_name,
           customer_phone = v_phone,
           version = version + 1
     where booking_id = v_existing.id
       and status = 'active';

    return private.online_booking_result(v_existing.id);
  end if;

  -- AC-19: five new holds per client in any 15 minutes. The lock serializes
  -- one client's holds so two at once cannot both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended('online_booking:' || v_client_hash, 0));

  select count(*), min(b.created_at)
    into v_recent, v_oldest
    from public.booking b
   where b.client_hash = v_client_hash
     and b.created_at > v_now - interval '15 minutes';

  if v_recent >= 5 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'rate_limited',
      'retry_after_seconds',
      greatest(1, ceil(extract(epoch from (v_oldest + interval '15 minutes' - v_now))))::integer
    );
  end if;

  -- The day, in the venue's own timezone and hours (AC-4).
  select * into v_settings from public.venue_settings s where s.id;
  v_slot := make_interval(mins => v_settings.slot_minutes);
  v_today := (v_now at time zone v_settings.timezone)::date;

  if p_day < v_today or p_day > v_today + v_settings.booking_horizon_days then
    return jsonb_build_object('ok', false, 'reason', 'out_of_range');
  end if;

  select h.open_time, h.close_time
    into v_open, v_close
    from public.venue_hours h
   where h.day_of_week = extract(dow from p_day);

  if v_open is null then
    return jsonb_build_object('ok', false, 'reason', 'out_of_range');
  end if;

  -- `date + time '24:00'` is the next midnight, so a close at midnight is a
  -- real end, never the start of the same day.
  v_open_at := (p_day + v_open) at time zone v_settings.timezone;
  v_close_at := (p_day + v_close) at time zone v_settings.timezone;

  -- The picks, sorted by court then time.
  if jsonb_typeof(p_picks) is distinct from 'array'
     or jsonb_array_length(p_picks) not between 1 and 200 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select array_agg(p.court_id order by p.court_id, p.starts_at),
         array_agg(p.starts_at order by p.court_id, p.starts_at),
         count(distinct (p.court_id, p.starts_at))
    into v_courts, v_starts, v_count
    from jsonb_to_recordset(p_picks) as p(court_id bigint, starts_at timestamptz);

  if v_count <> jsonb_array_length(p_picks)
     or array_position(v_courts, null) is not null
     or array_position(v_starts, null) is not null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- Every pick: a live court, a slot the grid would draw on this day, and a
  -- start still ahead of now. One bad pick refuses the lot.
  if exists (
    select 1
      from unnest(v_courts, v_starts) as p(court_id, starts_at)
     where not exists (
             select 1 from public.court c where c.id = p.court_id and c.retired_at is null
           )
        or p.starts_at < v_open_at
        or p.starts_at + v_slot > v_close_at
        or extract(epoch from (p.starts_at - v_open_at)) % (v_settings.slot_minutes * 60) <> 0
        or p.starts_at <= v_now
  ) then
    return jsonb_build_object('ok', false, 'reason', 'out_of_range');
  end if;

  -- AC-16: a lapsed hold the minute job has not reached yet never blocks a
  -- new one. Only holds overlapping these picks are ended here.
  for v_lapsed in
    select distinct b.id
      from public.booking b
      join public.reservation r on r.booking_id = b.id and r.status = 'active'
      join unnest(v_courts, v_starts) as p(court_id, starts_at)
        on r.court_id = p.court_id
       and r.during && tstzrange(p.starts_at, p.starts_at + v_slot, '[)')
     where b.status = 'held'
       and b.hold_expires_at <= v_now
  loop
    perform private.expire_online_booking(v_lapsed);
  end loop;

  -- AC-6: name every pick somebody already holds, and write nothing.
  select private.taken_picks(v_courts, v_starts, v_slot) into v_taken;
  if jsonb_array_length(v_taken) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken', 'slots', v_taken);
  end if;

  -- AC-17: the price is never an input. Tiles times hours per tile times the
  -- rate read now; a later rate change leaves this booking's amount alone.
  v_amount := cardinality(v_starts) * (v_settings.slot_minutes / 60.0) * v_settings.hourly_rate;

  loop
    v_code := private.new_booking_code();
    exit when not exists (select 1 from public.booking b where b.code = v_code);
  end loop;

  begin
    insert into public.booking (
      code, status, customer_name, customer_phone, customer_email,
      amount, hourly_rate, hold_expires_at, terms_version, terms_accepted_at,
      submission_id, client_hash
    )
    values (
      v_code, 'held', v_name, v_phone, v_email,
      v_amount, v_settings.hourly_rate, v_now + interval '10 minutes', p_terms_version, v_now,
      p_submission_id, v_client_hash
    )
    returning id into v_booking_id;

    -- Invariant 3b: the database names the one path this booking may upload
    -- to. No extension; the content type travels with the object.
    update public.booking
       set proof_path = v_booking_id::text || '/' || p_submission_id::text
     where id = v_booking_id;

    -- One row per run of adjacent picks on a court, as the desk books them.
    -- Each run carries its own share, and the shares add up to the amount.
    insert into public.reservation (
      court_id, kind, status, starts_at, ends_at, customer_name, customer_phone,
      payment_status, amount, created_by, changed_by, booking_id
    )
    select run.court_id, 'booking', 'active', run.starts_at, run.ends_at, v_name, v_phone,
           'unpaid',
           run.tiles * (v_settings.slot_minutes / 60.0) * v_settings.hourly_rate,
           null, null, v_booking_id
      from (
        select g.court_id,
               min(g.starts_at) as starts_at,
               max(g.starts_at) + v_slot as ends_at,
               count(*) as tiles
          from (
            select p.court_id,
                   p.starts_at,
                   p.starts_at - v_slot * row_number() over (
                     partition by p.court_id order by p.starts_at
                   ) as island
              from unnest(v_courts, v_starts) as p(court_id, starts_at)
          ) g
         group by g.court_id, g.island
      ) run;
  exception when exclusion_violation then
    -- Somebody took a slot between the check and the insert. The block has
    -- rolled back whole; look again to name what they took.
    return jsonb_build_object(
      'ok', false,
      'reason', 'slot_taken',
      'slots', private.taken_picks(v_courts, v_starts, v_slot)
    );
  end;

  return private.online_booking_result(v_booking_id);
end;
$$;

comment on function public.hold_online_booking(uuid, date, jsonb, text, text, text, text) is
  'Holds the picked slots for 10 minutes as one online booking, or updates the same submission''s details in place. The email is optional. Price, code, hours and the rate limit are all decided here. Executable by online_booking only. Spec 0015, AC-4, amended 2026-10-05.';
