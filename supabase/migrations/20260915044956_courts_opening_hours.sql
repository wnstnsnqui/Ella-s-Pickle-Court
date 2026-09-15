-- Spec 0007: courts and opening hours.
--
-- The three gaps spec 0002 left open for the owner's settings page, closed in
-- one forward only migration: a live court's name is unique, a day may close
-- at midnight, and a court or hours change reaches every open board the way a
-- booking already does. Plus one function that reorders every live court in
-- one transaction, so a half applied order can never reach the grid.

-- ---------------------------------------------------------------------------
-- court
-- ---------------------------------------------------------------------------

-- Invariant 1: no two live courts share a name, ignoring case and outer
-- spaces. A retired court may share a name with a live one, so a court can be
-- retired and a new one given the same name. `23505` on this index is mapped
-- to the `name_taken` conflict by describeDatabaseError.
create unique index court_live_name_idx
  on public.court (lower(btrim(name)))
  where retired_at is null;

-- reorder_courts parks every listed court at a negative order inside its
-- transaction, so the check has to allow one. The Zod schema stays at 0 to
-- 9999, so application code never writes a negative and no reader sees one.
alter table public.court drop constraint court_sort_order_check;
alter table public.court
  add constraint court_sort_order_check check (sort_order between -10000 and 9999);

-- ---------------------------------------------------------------------------
-- venue_settings
-- ---------------------------------------------------------------------------

-- Invariant 3: Postgres `time` accepts `24:00:00`, and the existing
-- `close > open` checks already let it through as a close. This keeps it out
-- of the open times, so a day can end at midnight but never start there.
alter table public.venue_settings
  add constraint venue_settings_open_before_midnight_check
  check (weekday_open < time '24:00' and weekend_open < time '24:00');

-- ---------------------------------------------------------------------------
-- reorder_courts: the whole live list, in one transaction
-- ---------------------------------------------------------------------------

-- `security invoker`, so the owner policies on `court` still decide every row
-- this touches. A non owner can call it, and every update inside it then
-- affects nothing; that is caught by counting rows, because Postgres alone
-- would report success. `versions` is checked first so a stale list is refused
-- before anything moves, and the two updates exist because the partial unique
-- index on `sort_order` is checked row by row: swapping two neighbours in one
-- statement would collide halfway through.
create or replace function public.reorder_courts(ids bigint[], versions integer[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  listed integer := coalesce(array_length(ids, 1), 0);
  touched integer;
  mismatch record;
begin
  if listed = 0 or coalesce(array_length(versions, 1), 0) <> listed then
    raise exception 'ids and versions must be the same non empty length'
      using errcode = '22023';
  end if;
  if (select count(distinct t.id) from unnest(ids) as t(id)) <> listed then
    raise exception 'ids must not repeat'
      using errcode = '22023';
  end if;

  -- Lock the listed rows in id order, so two owners reordering at once wait
  -- for each other rather than deadlocking.
  perform 1
  from public.court c
  where c.id = any(ids)
  order by c.id
  for update;

  -- A row the caller cannot see, or one at another version, means the list
  -- on screen is not the list in the database. Refuse before anything moves.
  select t.id, t.version, c.version as current_version
  into mismatch
  from unnest(ids, versions) as t(id, version)
  left join public.court c on c.id = t.id
  where c.id is null or c.version <> t.version
  limit 1;
  if found then
    raise exception 'stale_version: court % is at version %, not %',
      mismatch.id, mismatch.current_version, mismatch.version
      using errcode = 'P0002';
  end if;

  -- Park every listed court out of the way of the unique index.
  update public.court c
  set sort_order = -t.position
  from unnest(ids) with ordinality as t(id, position)
  where c.id = t.id;
  get diagnostics touched = row_count;
  if touched <> listed then
    raise exception 'Only an owner may reorder the courts.'
      using errcode = '42501';
  end if;

  -- Then number them 0..n-1 in the submitted order.
  update public.court c
  set sort_order = t.position - 1,
      version = c.version + 1,
      changed_by = (select auth.jwt() ->> 'sub')
  from unnest(ids) with ordinality as t(id, position)
  where c.id = t.id;
  get diagnostics touched = row_count;
  if touched <> listed then
    raise exception 'Only an owner may reorder the courts.'
      using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.reorder_courts(bigint[], integer[]) from public, anon;
grant execute on function public.reorder_courts(bigint[], integer[]) to authenticated;

-- ---------------------------------------------------------------------------
-- The broadcast for a court or settings change
-- ---------------------------------------------------------------------------

-- Identity only. Court names and hours are anon readable already, but the
-- payload stays column free so no future column on `court` ever needs a
-- review of this channel. Every board refetches on the event and never patches
-- state from it.
create or replace function public.schedule_meta_broadcast()
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
      'id', subject.id::text
    ),
    case tg_table_name when 'court' then 'court_changed' else 'settings_changed' end,
    'schedule',
    true
  );
  return null;
end;
$$;

-- A trigger body and nothing else. Security definer, so it must never be
-- callable by hand.
revoke execute on function public.schedule_meta_broadcast() from public, anon, authenticated;

create trigger court_broadcast_changes
  after insert or update on public.court
  for each row execute function public.schedule_meta_broadcast();

create trigger venue_settings_broadcast_changes
  after update on public.venue_settings
  for each row execute function public.schedule_meta_broadcast();
