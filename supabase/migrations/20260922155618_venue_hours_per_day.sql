-- Spec 0007, the per day opening hours revision (AC-16, AC-24).
--
-- The venue opens later on a Friday night than on the other weekdays, and the
-- hours model could not say so: one pair of times for weekdays and one for
-- weekends, so Friday was simply Monday. The four columns on `venue_settings`
-- are replaced here by `public.venue_hours`, exactly seven rows, one per day of
-- the week, where a row with no times is closed all day.
--
-- Big bang on purpose (see the spec's migration plan): the backfill and the
-- column drop are in this one transaction, so no read can survive on stale
-- columns and be silently right six days a week and wrong on Friday.

-- ---------------------------------------------------------------------------
-- venue_hours
-- ---------------------------------------------------------------------------

-- `0` is Sunday, matching both Postgres `extract(dow)` and JavaScript
-- `getUTCDay()`, so nothing in this codebase translates between two numbering
-- schemes. Monday renders first, which is a display order in one array.
create table public.venue_hours (
  day_of_week smallint primary key,
  open_time   time,
  close_time  time,
  changed_by  text references public.staff (user_id),
  updated_at  timestamptz not null default now(),
  constraint venue_hours_day_check check (day_of_week between 0 and 6),
  -- Invariant 9: a day is open with both times set, or closed with both null.
  -- There is no third state and no half existing day.
  constraint venue_hours_pair_check check ((open_time is null) = (close_time is null)),
  constraint venue_hours_order_check check (close_time > open_time),
  -- Invariant 3: `24:00` is legal as a close and never as an open, the same
  -- rule `venue_settings_open_before_midnight_check` carried.
  constraint venue_hours_open_before_midnight_check check (open_time < time '24:00')
);

create index venue_hours_changed_by_idx on public.venue_hours (changed_by);

create trigger venue_hours_set_updated_at
  before update on public.venue_hours
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- The seed, backfilled from the four columns before they go
-- ---------------------------------------------------------------------------

-- Exactly seven rows, for the life of the database. Days 1 to 5 take the old
-- weekday pair and days 0 and 6 the old weekend pair, which is what the venue
-- was actually running on the day this migration applied.
insert into public.venue_hours (day_of_week, open_time, close_time)
select
  d.day_of_week,
  case when d.day_of_week between 1 and 5 then s.weekday_open else s.weekend_open end,
  case when d.day_of_week between 1 and 5 then s.weekday_close else s.weekend_close end
from public.venue_settings s
cross join generate_series(0, 6) as d(day_of_week);

-- If `venue_settings` were ever empty the cross join would seed nothing, and a
-- board would render an empty grid rather than fail. Refuse instead.
do $$
begin
  if (select count(*) from public.venue_hours) <> 7 then
    raise exception 'venue_hours seeded % rows, expected 7',
      (select count(*) from public.venue_hours);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The four columns, and the checks that governed them
-- ---------------------------------------------------------------------------

alter table public.venue_settings
  drop constraint venue_settings_weekday_hours_check,
  drop constraint venue_settings_weekend_hours_check,
  drop constraint venue_settings_open_before_midnight_check;

alter table public.venue_settings
  drop column weekday_open,
  drop column weekday_close,
  drop column weekend_open,
  drop column weekend_close;

-- ---------------------------------------------------------------------------
-- Grants and policies: venue_settings' own, with insert and delete taken away
-- ---------------------------------------------------------------------------

alter table public.venue_hours enable row level security;

-- Invariant 8: the seven rows are permanently the seven rows. The cardinality
-- is unwritable rather than policed by a rule something could forget to apply,
-- so no code can create an eighth day or lose Tuesday.
revoke all on public.venue_hours from anon, authenticated;
grant select on public.venue_hours to anon, authenticated;
grant update on public.venue_hours to authenticated;

-- The public board renders the hours, so anon reads them, exactly as it reads
-- `venue_settings` today.
create policy venue_hours_select_all
  on public.venue_hours for select to anon, authenticated
  using (true);

create policy venue_hours_update_owner
  on public.venue_hours for update to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

-- ---------------------------------------------------------------------------
-- The broadcast: its own function, not the shared one
-- ---------------------------------------------------------------------------

-- `schedule_meta_broadcast()` reads `subject.id`, and this table is keyed by
-- `day_of_week` with no `id` column at all. Attaching it here would raise
-- "record has no field id" inside `save_venue_hours`'s transaction and abort
-- every single hours save (AC-24). Identity only, like every other payload on
-- this topic; boards refetch on the event and never patch state from it.
create or replace function public.venue_hours_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject record;
begin
  if new is null then
    subject := old;
  else
    subject := new;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'op', lower(tg_op),
      'table', tg_table_name,
      'id', subject.day_of_week::text
    ),
    'settings_changed',
    'schedule',
    true
  );
  return null;
end;
$$;

-- A trigger body and nothing else. Security definer, so it must never be
-- callable by hand.
revoke execute on function public.venue_hours_broadcast() from public, anon, authenticated;

create trigger venue_hours_broadcast_changes
  after update on public.venue_hours
  for each row execute function public.venue_hours_broadcast();
