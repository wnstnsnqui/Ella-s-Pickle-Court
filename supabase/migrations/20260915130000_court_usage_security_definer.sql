-- Spec 0008 fix: `court_usage` must be `security definer`, not `security invoker`.
--
-- `authenticated` has no `usage` on schema `private` (revoked deliberately in
-- 20260905043037_court_schedule.sql). A row level security policy that calls
-- `private.is_owner()` is planned once as the table owner, so it only ever
-- needed `execute` on the helper at runtime (the fix in
-- 20260914072322_policy_helper_execute.sql). A plpgsql function body is
-- different: it resolves `private.is_owner()` under the calling role's own
-- privileges on every call, so `execute` alone was not enough here. The
-- result: every call to `court_usage`, owner or staff alike, failed at
-- `permission denied for schema private` before the owner check itself ever
-- ran (found live in `/check verify`, confirmed against both a real owner and
-- a real staff account).
--
-- `security definer` is the same trick `private.is_owner()` and
-- `private.is_active_staff()` already use to reach across schemas, and it is
-- safe here for the same reason: the owner check is still this function's own
-- first line, unconditional, before any row is read. The body is otherwise
-- byte for byte the migration this replaces.
create or replace function public.court_usage(from_date date, to_date date, for_court_id bigint default null)
returns table (court_id bigint, local_date date, hour integer, booked_minutes integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz text;
  range_start timestamptz;
  range_end timestamptz;
begin
  if not (select private.is_owner()) then
    raise exception 'Only an owner may read court usage.'
      using errcode = '42501';
  end if;

  select v.timezone into tz from public.venue_settings v;

  -- The half open span of instants from the start of `from_date` to the start
  -- of the day after `to_date`, both read in the venue's own zone.
  range_start := (from_date::timestamp at time zone tz);
  range_end := ((to_date + 1)::timestamp at time zone tz);

  return query
  with clipped as (
    select
      r.court_id as row_court_id,
      greatest(r.starts_at, range_start) as clip_start,
      least(r.ends_at, range_end) as clip_end
    from public.reservation r
    where r.kind = 'booking'
      and r.status = 'active'
      and r.during && tstzrange(range_start, range_end, '[)')
      and (for_court_id is null or r.court_id = for_court_id)
  ),
  local_bounds as (
    select
      row_court_id,
      clip_start,
      clip_end,
      clip_start at time zone tz as clip_start_local,
      clip_end at time zone tz as clip_end_local
    from clipped
    where clip_end > clip_start
  ),
  -- One row per local hour the clipped booking touches. Subtracting a
  -- microsecond keeps a booking ending exactly on the hour from generating an
  -- empty extra row for the hour it does not touch (a booking ending at
  -- midnight lands only in hour 23 of its own day, never hour 0 of the next).
  hours as (
    select
      lb.row_court_id,
      hour_local,
      greatest(lb.clip_start, (hour_local at time zone tz)) as bucket_start,
      least(lb.clip_end, (hour_local at time zone tz) + interval '1 hour') as bucket_end
    from local_bounds lb
    cross join lateral generate_series(
      date_trunc('hour', lb.clip_start_local),
      lb.clip_end_local - interval '1 microsecond',
      interval '1 hour'
    ) as h(hour_local)
  )
  select
    hours.row_court_id,
    hour_local::date,
    extract(hour from hour_local)::int,
    round(sum(extract(epoch from (bucket_end - bucket_start)) / 60))::int as booked_minutes
  from hours
  where bucket_end > bucket_start
  group by hours.row_court_id, hour_local
  having round(sum(extract(epoch from (bucket_end - bucket_start)) / 60)) > 0
  order by 1, 2, 3;
end;
$$;

-- Unchanged from the original migration; restated so grants stay explicit
-- beside the function that they gate.
revoke execute on function public.court_usage(date, date, bigint) from public, anon;
grant execute on function public.court_usage(date, date, bigint) to authenticated;
