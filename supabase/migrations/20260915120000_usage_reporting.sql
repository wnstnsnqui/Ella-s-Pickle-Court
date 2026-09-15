-- Spec 0008: usage reporting.
--
-- Two additions, both read only for every existing write path. `cancelled_at`
-- and `cancelled_by` turn "who cancelled this" into a plain column, filled by a
-- trigger so any cancel path fills it, not just today's. `court_usage` splits
-- every active booking in a range into local hour buckets in one query, so the
-- owner's report never has to do that folding in application code.

-- ---------------------------------------------------------------------------
-- reservation.cancelled_at, reservation.cancelled_by
-- ---------------------------------------------------------------------------

alter table public.reservation
  add column cancelled_at timestamptz,
  add column cancelled_by text references public.staff (clerk_user_id);

create index reservation_cancelled_by_idx on public.reservation (cancelled_by);

-- `security invoker`: this only ever fires from a write already going through
-- the update policy, so it carries no privilege of its own. It reads
-- `new.changed_by`, which every write already sets, rather than the caller's
-- token directly, so it works the same whether the write came from
-- `cancelReservation` or from a path written after this one.
create or replace function public.reservation_set_cancelled()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status = 'cancelled' then
    new.cancelled_at := now();
    new.cancelled_by := new.changed_by;
  end if;
  return new;
end;
$$;

revoke execute on function public.reservation_set_cancelled() from public, anon, authenticated;

create trigger reservation_set_cancelled_trigger
  before update on public.reservation
  for each row execute function public.reservation_set_cancelled();

-- Backfill every row already cancelled before this trigger existed, from the
-- latest audit row that carried the active to cancelled transition.
with latest_cancel as (
  select distinct on (reservation_id)
    reservation_id,
    changed_at,
    changed_by
  from public.reservation_audit
  where op = 'update'
    and old_row ->> 'status' = 'active'
    and new_row ->> 'status' = 'cancelled'
  order by reservation_id, changed_at desc
)
update public.reservation r
set cancelled_at = latest_cancel.changed_at,
    cancelled_by = latest_cancel.changed_by
from latest_cancel
where r.id = latest_cancel.reservation_id
  and r.status = 'cancelled';

-- A cancelled row with no matching audit row (older than the audit trail, or
-- never recorded one) falls back to its own `updated_at`, with no actor.
update public.reservation
set cancelled_at = updated_at
where status = 'cancelled' and cancelled_at is null;

alter table public.reservation
  add constraint reservation_cancelled_at_matches_status_check
  check ((status = 'cancelled') = (cancelled_at is not null));

-- ---------------------------------------------------------------------------
-- court_usage: every active booking in a range, split into local hour minutes
-- ---------------------------------------------------------------------------

-- The parameter carrying the court filter is named `for_court_id` rather than
-- `court_id`: Postgres refuses a function whose input and output parameter
-- lists share a name, and the output row's first column is `court_id` per
-- AC-4. The RPC call names it `for_court_id`; nothing about the returned rows
-- changes.
create or replace function public.court_usage(from_date date, to_date date, for_court_id bigint default null)
returns table (court_id bigint, local_date date, hour integer, booked_minutes integer)
language plpgsql
stable
security invoker
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

-- `private.is_owner()` is already executable by `authenticated` (migration
-- 20260914072322); this only needs its own grant.
revoke execute on function public.court_usage(date, date, bigint) from public, anon;
grant execute on function public.court_usage(date, date, bigint) to authenticated;
