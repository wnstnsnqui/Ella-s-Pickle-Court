-- Spec 0007, the per day opening hours revision (AC-17).
--
-- A week is one edit. Seven rows and the two settings that sit beside them are
-- written in one transaction against one version, so no reader ever sees three
-- days of the new week and four of the old.
--
-- The signature carries `slot_minutes` and `booking_horizon_days` as well as
-- the days. AC-17 names a two argument function and also requires the slot
-- length and the horizon to be written in the same transaction; those cannot
-- both hold, because this function bumps `venue_settings.version` itself and a
-- second write from the action would have to fight its own guard. Widened on
-- the engineer's call during /develop on 2026-09-22; AC-17's signature line
-- owes a correction.

create or replace function public.save_venue_hours(
  days jsonb,
  settings_version integer,
  slot_minutes integer,
  booking_horizon_days integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_version integer;
  touched integer;
begin
  -- Invariant 8: the week is the seven days, every time. `insert` and `delete`
  -- are revoked on the table, so this is about a caller sending a short or
  -- lopsided list rather than about the table's cardinality.
  if jsonb_typeof(days) is distinct from 'array' or jsonb_array_length(days) <> 7 then
    raise exception 'days must hold exactly seven entries'
      using errcode = '22023';
  end if;
  if (
    select count(distinct (entry ->> 'day_of_week')::smallint)
    from jsonb_array_elements(days) as entry
    where (entry ->> 'day_of_week')::smallint between 0 and 6
  ) <> 7 then
    raise exception 'days must cover day_of_week 0 to 6, once each'
      using errcode = '22023';
  end if;

  -- The version is checked before anything is written, so a stale week leaves
  -- all seven rows untouched. `P0002` is already mapped to `version_stale`.
  select v.version into current_version from public.venue_settings v where v.id;
  if current_version is null then
    raise exception 'The venue settings row is missing.'
      using errcode = 'P0002';
  end if;
  if current_version <> settings_version then
    raise exception 'stale_version: the settings are at version %, not %',
      current_version, settings_version
      using errcode = 'P0002';
  end if;

  update public.venue_hours h
  set open_time = entry.open_time,
      close_time = entry.close_time,
      changed_by = (select auth.jwt() ->> 'sub')
  from jsonb_to_recordset(days)
    as entry(day_of_week smallint, open_time time, close_time time)
  where h.day_of_week = entry.day_of_week;
  get diagnostics touched = row_count;
  -- A non owner is caught here: the owner policy makes the update affect
  -- nothing, and Postgres alone would report success. `42501` is already
  -- mapped to `forbidden`.
  if touched <> 7 then
    raise exception 'Only an owner may change the opening hours.'
      using errcode = '42501';
  end if;

  update public.venue_settings v
  set slot_minutes = save_venue_hours.slot_minutes,
      booking_horizon_days = save_venue_hours.booking_horizon_days,
      version = v.version + 1,
      changed_by = (select auth.jwt() ->> 'sub')
  where v.id and v.version = settings_version;
  get diagnostics touched = row_count;
  if touched <> 1 then
    raise exception 'Only an owner may change the opening hours.'
      using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.save_venue_hours(jsonb, integer, integer, integer)
  from public, anon;
grant execute on function public.save_venue_hours(jsonb, integer, integer, integer)
  to authenticated;
