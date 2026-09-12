-- Spec 0002: the data model for the court booking schedule.
--
-- One table of time ranges carries the whole thing. A row says "court 2 is taken
-- from 4pm to 5pm", either because somebody booked it or because it is closed,
-- and an exclusion constraint makes a second overlapping row impossible. There
-- is no stored availability: Available is the absence of a row inside opening
-- hours, worked out at read time.

-- The exclusion constraint needs btree_gist to mix `court_id with =` and
-- `during with &&` in one index.
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- The scaffold's throwaway goes first, so nothing outlives its purpose.
-- ---------------------------------------------------------------------------

drop trigger if exists realtime_smoke_broadcast on public.realtime_smoke;
drop function if exists public.realtime_smoke_changes();
drop table if exists public.realtime_smoke;
drop policy if exists "anon may read the smoke broadcast topic" on realtime.messages;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Who may write, joined to Clerk by the `sub` claim on the token.
create table public.staff (
  clerk_user_id text primary key,
  display_name  text not null,
  role          text not null default 'staff',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint staff_role_check check (role in ('staff', 'owner')),
  constraint staff_display_name_check check (length(btrim(display_name)) between 1 and 80)
);

comment on table public.staff is
  'Staff accounts, keyed on the Clerk subject. Every policy in spec 0002 reads this table through private.is_active_staff().';

-- The columns of the grid.
create table public.court (
  id          bigint generated always as identity primary key,
  name        text not null,
  sort_order  integer not null,
  note        text,
  -- Not a soft delete flag: it records when the court went out of use, and the
  -- court keeps its history either way.
  retired_at  timestamptz,
  version     integer not null default 1,
  changed_by  text references public.staff (clerk_user_id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint court_name_check check (length(btrim(name)) between 1 and 40),
  constraint court_note_check check (note is null or length(note) <= 200),
  constraint court_sort_order_check check (sort_order between 0 and 9999)
);

-- The one table that makes a cell read anything other than Available.
create table public.reservation (
  id             bigint generated always as identity primary key,
  -- No cascade delete. A court is retired, never deleted.
  court_id       bigint not null references public.court (id),
  kind           text not null,
  status         text not null default 'active',
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  -- The half open range the overlap rule works on: touching at the hour is not
  -- overlapping, so 4pm to 5pm and 5pm to 6pm both fit.
  during         tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  customer_name  text,
  customer_phone text,
  note           text,
  payment_status text not null default 'unpaid',
  amount         numeric(10, 2),
  version        integer not null default 1,
  created_by     text references public.staff (clerk_user_id),
  changed_by     text references public.staff (clerk_user_id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint reservation_kind_check check (kind in ('booking', 'closed')),
  constraint reservation_status_check check (status in ('active', 'cancelled')),
  constraint reservation_payment_status_check
    check (payment_status in ('unpaid', 'partial', 'paid', 'waived')),
  constraint reservation_ends_after_starts_check check (ends_at > starts_at),
  -- Invariant 3: a booking always names somebody, a closure does not have to.
  constraint reservation_customer_name_required_check
    check (kind = 'closed' or customer_name is not null),
  constraint reservation_customer_name_check
    check (customer_name is null or length(btrim(customer_name)) between 1 and 80),
  constraint reservation_customer_phone_check
    check (customer_phone is null or length(customer_phone) <= 30),
  constraint reservation_note_check check (note is null or length(note) <= 200),
  constraint reservation_amount_check check (amount is null or amount >= 0)
);

-- Invariant 1, and the reason this shape was chosen: two active reservations
-- cannot overlap on a court, even when both are submitted at the same instant.
-- Cancelled rows are outside the constraint, so cancelling frees the slot at once.
alter table public.reservation
  add constraint reservation_no_overlap
  exclude using gist (court_id with =, during with &&)
  where (status = 'active');

-- Opening hours and the rest of what Ella can change without a deploy.
create table public.venue_settings (
  id                   boolean primary key default true,
  weekday_open         time not null,
  weekday_close        time not null,
  weekend_open         time not null,
  weekend_close        time not null,
  slot_minutes         integer not null default 60,
  booking_horizon_days integer not null default 30,
  timezone             text not null default 'Asia/Manila',
  version              integer not null default 1,
  changed_by           text references public.staff (clerk_user_id),
  updated_at           timestamptz not null default now(),
  -- Invariant 4: a second settings row is impossible.
  constraint venue_settings_singleton_check check (id),
  constraint venue_settings_slot_minutes_check check (slot_minutes in (30, 60, 90)),
  constraint venue_settings_horizon_check check (booking_horizon_days between 1 and 365),
  constraint venue_settings_weekday_hours_check check (weekday_close > weekday_open),
  constraint venue_settings_weekend_hours_check check (weekend_close > weekend_open)
);

-- Append only, written by a trigger, never by application code. An owner may
-- change a booking that has already happened, so every change leaves a trace.
create table public.reservation_audit (
  id             bigint generated always as identity primary key,
  -- Not a foreign key on purpose: the audit outlives the row it describes.
  reservation_id bigint not null,
  op             text not null,
  old_row        jsonb,
  new_row        jsonb,
  changed_by     text,
  changed_at     timestamptz not null default now(),
  constraint reservation_audit_op_check check (op in ('insert', 'update', 'delete'))
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Invariant 5: order is unique among live courts, and a retired court keeps its
-- old number without standing in the way.
create unique index court_live_sort_order_idx
  on public.court (sort_order)
  where retired_at is null;

-- What the day bounded grid read actually filters on.
create index reservation_court_starts_at_idx on public.reservation (court_id, starts_at);

-- Foreign keys, so a staff or court lookup never falls back to a scan.
create index reservation_created_by_idx on public.reservation (created_by);
create index reservation_changed_by_idx on public.reservation (changed_by);
create index court_changed_by_idx on public.court (changed_by);
create index venue_settings_changed_by_idx on public.venue_settings (changed_by);

create index reservation_audit_reservation_idx
  on public.reservation_audit (reservation_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Helper functions, in a schema nothing is exposed from
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- Security definer so a policy can read `staff` without every caller needing a
-- grant on it, and so the policy on `staff` itself cannot recurse. Each one
-- checks the calling token internally and is called once per statement, not
-- once per row.
create or replace function private.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff s
    where s.clerk_user_id = (select auth.jwt() ->> 'sub')
      and s.is_active
  );
$$;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff s
    where s.clerk_user_id = (select auth.jwt() ->> 'sub')
      and s.is_active
      and s.role = 'owner'
  );
$$;

revoke execute on function private.is_active_staff() from public, anon, authenticated;
revoke execute on function private.is_owner() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Timestamps and the audit trail
-- ---------------------------------------------------------------------------

-- `updated_at` comes from the database clock, never from whatever the client
-- believes the time is.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger court_set_updated_at
  before update on public.court
  for each row execute function public.set_updated_at();

create trigger reservation_set_updated_at
  before update on public.reservation
  for each row execute function public.set_updated_at();

create trigger venue_settings_set_updated_at
  before update on public.venue_settings
  for each row execute function public.set_updated_at();

create or replace function public.reservation_audit_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.reservation_audit (reservation_id, op, old_row, new_row, changed_by)
  values (
    coalesce(new.id, old.id),
    lower(tg_op),
    case when old is null then null else to_jsonb(old) end,
    case when new is null then null else to_jsonb(new) end,
    (select auth.jwt() ->> 'sub')
  );
  return null;
end;
$$;

create trigger reservation_audit_trail
  after insert or update or delete on public.reservation
  for each row execute function public.reservation_audit_write();

-- ---------------------------------------------------------------------------
-- The broadcast, narrowed by hand
-- ---------------------------------------------------------------------------

-- This deliberately does NOT call realtime.broadcast_changes(). That helper
-- sends the whole row, which would put customer_phone and amount on a channel
-- anon is allowed to read. The payload below carries only what the public grid
-- already sees through the column grant.
create or replace function public.reservation_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject record;
begin
  -- Delete is granted to nobody today, so that branch is unreachable. It is
  -- written anyway: the day somebody grants delete is not the day to find out
  -- the trigger dereferences a null row.
  if new is null then
    subject := old;
  else
    subject := new;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'op', lower(tg_op),
      'court_id', subject.court_id,
      'starts_at', subject.starts_at,
      'ends_at', subject.ends_at,
      'kind', subject.kind,
      'status', subject.status
    ),
    'reservation_changed',
    'schedule',
    true
  );
  return null;
end;
$$;

create trigger reservation_broadcast_changes
  after insert or update or delete on public.reservation
  for each row execute function public.reservation_broadcast();

-- ---------------------------------------------------------------------------
-- Grants. A grant is what makes a table reachable at all; the policies below
-- then decide which rows.
-- ---------------------------------------------------------------------------

alter table public.staff enable row level security;
alter table public.court enable row level security;
alter table public.reservation enable row level security;
alter table public.venue_settings enable row level security;
alter table public.reservation_audit enable row level security;

-- Nobody may delete anything, on any table. Reservations are cancelled and
-- courts are retired.

grant select on public.staff to authenticated;

grant select on public.court to anon, authenticated;
grant insert, update on public.court to authenticated;

grant select on public.venue_settings to anon, authenticated;
grant insert, update on public.venue_settings to authenticated;

grant select on public.reservation_audit to authenticated;

-- Invariant 9, and the whole of AC-4. Row level security guards rows, not
-- columns, so the column grant is what keeps a customer's phone number out of
-- reach. Postgres refuses a column the role has no grant on, so an anonymous
-- `select *` fails loudly rather than quietly returning too much.
revoke select on public.reservation from anon;
grant select (court_id, starts_at, ends_at, kind) on public.reservation to anon;
grant select on public.reservation to authenticated;
grant insert, update on public.reservation to authenticated;

-- ---------------------------------------------------------------------------
-- Policies. Authorization lives here, never in an `if` in a Server Action.
-- ---------------------------------------------------------------------------

create policy "active staff may read the staff list"
  on public.staff for select to authenticated
  using ((select private.is_active_staff()));

create policy "anyone may read a live court"
  on public.court for select to anon, authenticated
  using (retired_at is null);

create policy "active staff may read every court"
  on public.court for select to authenticated
  using ((select private.is_active_staff()));

create policy "an owner may add a court"
  on public.court for insert to authenticated
  with check ((select private.is_owner()));

create policy "an owner may change a court"
  on public.court for update to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

create policy "anyone may read the venue settings"
  on public.venue_settings for select to anon, authenticated
  using (true);

create policy "an owner may seed the venue settings"
  on public.venue_settings for insert to authenticated
  with check ((select private.is_owner()));

create policy "an owner may change the venue settings"
  on public.venue_settings for update to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

-- Paired with the four column grant above: this decides the rows, the grant
-- decides the columns.
create policy "anyone may read an active block"
  on public.reservation for select to anon
  using (status = 'active');

create policy "active staff may read every reservation"
  on public.reservation for select to authenticated
  using ((select private.is_active_staff()));

create policy "active staff may book from today onward"
  on public.reservation for insert to authenticated
  with check (
    (select private.is_active_staff())
    and (ends_at > now() or (select private.is_owner()))
  );

-- The same test goes in both halves, and that is what makes the rule complete.
-- `using` tests the row as it stands, so a regular staff member cannot touch a
-- booking that has already ended. `with check` tests the row as it would become,
-- so they also cannot drag a future booking back into the past to escape it.
create policy "active staff may change a reservation that has not ended"
  on public.reservation for update to authenticated
  using (
    (select private.is_active_staff())
    and (ends_at > now() or (select private.is_owner()))
  )
  with check (
    (select private.is_active_staff())
    and (ends_at > now() or (select private.is_owner()))
  );

create policy "active staff may read the audit trail"
  on public.reservation_audit for select to authenticated
  using ((select private.is_active_staff()));

-- The narrowed payload above is what travels on this topic, so anon reading it
-- learns nothing it could not already read through the column grant.
create policy "anyone may read the schedule broadcast topic"
  on realtime.messages for select to anon, authenticated
  using (
    (select realtime.topic()) = 'schedule'
    and extension = 'broadcast'
  );

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------

insert into public.court (name, sort_order, note)
values
  ('Court 1', 1, null),
  ('Court 2', 2, null);

insert into public.venue_settings (
  id, weekday_open, weekday_close, weekend_open, weekend_close,
  slot_minutes, booking_horizon_days, timezone
)
values (true, '06:00', '22:00', '06:00', '23:00', 60, 30, 'Asia/Manila');
