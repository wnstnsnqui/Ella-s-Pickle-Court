# 0002. Data model for the court booking schedule

**Date**: 2026-09-05
**Status**: In Progress

## Summary

Ella's Picklecourt is a booking schedule, not a live status board. A player or a staff member picks a day and sees a grid: time down the side, one column per court, and every cell reading Booked, Available or Unavailable. The whole thing rests on one table of time ranges. A row says "court 2 is taken from 4pm to 5pm", either because somebody booked it or because it is closed, and Postgres itself refuses to accept a second row that overlaps, so a double booking is physically impossible. Available is simply the absence of a row inside opening hours, so nothing has to be generated in advance and no second copy of the truth can drift.

Four tables: `staff`, `court`, `reservation` and `venue_settings`. Bookings carry a customer name, a phone number, a note and a payment record, and none of that ever reaches the public page.

## Requirements

**User stories**

- As a player, I want to open a page, pick a day and see which hours are free on each court, so that I know whether it is worth going.
- As a staff member, I want to add, change and cancel bookings on that grid, so that the schedule everyone reads is the schedule I keep.
- As a staff member, I want to record who a booking is for and whether they paid, so that I can answer questions at the desk.
- As Ella, I want to close a court for certain hours and change the opening hours, so that the grid matches how the venue actually runs.
- As Ella, I want every booking kept, cancellations included, so that I can look back at how the courts were used and what came in.

**Acceptance criteria** (the contract, each independently checkable)

- **AC-1**: `staff`, `court`, `reservation` and `venue_settings` exist as migrated tables with row level security enabled, explicit role grants, and a seed of two courts plus one settings row.
- **AC-2**: Two active reservations cannot overlap in time on the same court. The database rejects the second write, including when both are submitted at the same instant, and the rejection surfaces as a named conflict rather than a bare error.
- **AC-3**: Cancelling a reservation sets its status to `cancelled`, frees the slot for a new booking immediately, and leaves the row readable for reporting.
- **AC-4**: An anonymous read returns only the court, the time range, and whether the block is a booking or a closure. It never returns `customer_name`, `customer_phone`, `note`, `payment_status` or `amount`, from any query path including the realtime payload.
- **AC-5**: A cell's label is derived, not stored. Outside that weekday's opening hours it is `Unavailable`, an overlapping active `closed` row makes it `Unavailable`, an overlapping active `booking` row makes it `Booked`, otherwise it is `Available`. Weekday and slot boundaries are computed in `Asia/Manila`, never in UTC or the reader's own timezone.
- **AC-6**: An active staff member may create, edit and cancel reservations dated today or later. Only an `owner` may edit a reservation that has already ended, rename, reorder or retire a court, or change venue settings. A signed out visitor may write nothing. Every rule is enforced by a row level security policy, not by an `if` in a Server Action.
- **AC-7**: Retiring a court that still has active reservations after now is refused, and the refusal reports how many are in the way.
- **AC-8**: Every reservation and court write is conditional on the `version` the caller last read, increments it, and records `changed_by`. A stale version affects zero rows and the caller is shown the fresh row. Every insert, update and delete on `reservation` writes an audit row holding the old and new values and who made the change.
- **AC-9**: A reservation change reaches an open grid within a second or two with no reload, carried by a database trigger on a single schedule topic.
- **AC-10**: A booking records a payment state of `unpaid`, `partial`, `paid` or `waived`, and an optional amount stored exactly to two decimal places in pesos.
- **AC-11**: A booking that falls outside the current opening hours still appears on the grid, in its own row, marked as out of hours.
- **AC-12**: `kind`, `status` and `payment_status` are defined once in TypeScript. The Zod schemas are built from that definition and the database check constraints hold the same values, so the two cannot drift apart.

## Decision

**Chosen option**: Option 1: One table of time ranges, with a Postgres exclusion constraint refusing overlaps.

A reservation is a court plus a start and an end. A single exclusion constraint on `(court_id, during)` makes an overlapping active row impossible at the database level, closures and bookings share that one table so a booking cannot land inside a closure, and every cell label on the grid is computed at read time from opening hours plus the reservations that exist.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `zod` (`pproenca/dot-skills`, `.agents/skills/zod/`) · `clerk-nextjs-patterns` (`clerk/skills`, `.agents/skills/clerk-nextjs-patterns/`)

## Rationale

The reasoning, the options weighed, and the premise note about the product change this spec records: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**

`staff` — who may write, joined to Clerk

| Column | Type | Notes |
| --- | --- | --- |
| `clerk_user_id` | `text primary key` | fixed by spec 0001, the `sub` claim on the Clerk token |
| `display_name` | `text not null` | so history reads "added by Maria" |
| `role` | `text not null default 'staff'` | `check (role in ('staff','owner'))` |
| `is_active` | `boolean not null default true` | a leaver is switched off, their bookings still resolve to a name |
| `created_at` | `timestamptz not null default now()` | |

`court` — two rows today

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `bigint generated always as identity primary key` | |
| `name` | `text not null` | `check (length(btrim(name)) between 1 and 40)` |
| `sort_order` | `integer not null` | fixes the column order on the grid; `unique (sort_order) where retired_at is null` |
| `note` | `text` | optional, shown to players, `check (length(note) <= 200)` |
| `retired_at` | `timestamptz` | null means live. Not a soft delete flag: it records when |
| `version` | `integer not null default 1` | rule 6 of spec 0001 |
| `changed_by` | `text references staff(clerk_user_id)` | |
| `created_at` / `updated_at` | `timestamptz not null default now()` | |

`reservation` — the one table that makes a cell not Available

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `bigint generated always as identity primary key` | |
| `court_id` | `bigint not null references court(id)` | no cascade delete; a court is retired, never deleted |
| `kind` | `text not null` | `check (kind in ('booking','closed'))` |
| `status` | `text not null default 'active'` | `check (status in ('active','cancelled'))` |
| `starts_at` | `timestamptz not null` | UTC, always |
| `ends_at` | `timestamptz not null` | `check (ends_at > starts_at)` |
| `during` | `tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored` | the half open range the overlap rule uses |
| `customer_name` | `text` | `check (kind = 'closed' or customer_name is not null)`, `check (length(customer_name) <= 80)` |
| `customer_phone` | `text` | personal data, staff read only, `check (length(customer_phone) <= 30)` |
| `note` | `text` | "junior class", "surface repair", `check (length(note) <= 200)` |
| `payment_status` | `text not null default 'unpaid'` | `check (payment_status in ('unpaid','partial','paid','waived'))` |
| `amount` | `numeric(10,2)` | pesos, nullable, `check (amount is null or amount >= 0)` |
| `version` | `integer not null default 1` | |
| `created_by` / `changed_by` | `text references staff(clerk_user_id)` | |
| `created_at` / `updated_at` | `timestamptz not null default now()` | |

The overlap rule, which is the whole point of this shape:

```sql
create extension if not exists btree_gist;

alter table public.reservation
  add constraint reservation_no_overlap
  exclude using gist (court_id with =, during with &&)
  where (status = 'active');
```

`venue_settings` — one row, so hours change without a deploy

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `boolean primary key default true` | `check (id)`, so a second row is impossible |
| `weekday_open` / `weekday_close` | `time not null` | seeded `06:00` / `22:00` |
| `weekend_open` / `weekend_close` | `time not null` | seeded `06:00` / `23:00` |
| `slot_minutes` | `integer not null default 60` | `check (slot_minutes in (30,60,90))` |
| `booking_horizon_days` | `integer not null default 30` | how far ahead staff may book |
| `timezone` | `text not null default 'Asia/Manila'` | the one display timezone |
| `version` | `integer not null default 1` | |
| `changed_by` | `text references staff(clerk_user_id)` | |
| `updated_at` | `timestamptz not null default now()` | |

`reservation_audit` — append only, written by a trigger, never by application code

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `bigint generated always as identity primary key` | |
| `reservation_id` | `bigint not null` | not a foreign key, the audit outlives its row |
| `op` | `text not null` | `insert`, `update` or `delete` |
| `old_row` / `new_row` | `jsonb` | the whole row either side of the change |
| `changed_by` | `text` | from `(select auth.jwt() ->> 'sub')` |
| `changed_at` | `timestamptz not null default now()` | |

**What an anonymous visitor may read from `reservation`**, expressed as a column level grant rather than a view, so row level security stays switched on end to end:

```sql
revoke select on public.reservation from anon;
grant select (court_id, starts_at, ends_at, kind) on public.reservation to anon;
-- paired with an anon select policy: using (status = 'active')
```

Postgres refuses a column the role was not granted, so a leak is impossible without a deliberate `grant`. The tradeoff is that an anonymous `select *` fails loudly rather than quietly returning too much, which is the better failure, and the public read path must name its columns explicitly.

**Relationships**: `court` 1:N `reservation` · `staff` 1:N `reservation` (as `created_by` and `changed_by`) · `staff` 1:N `court` (as `changed_by`) · `venue_settings` is a singleton related to nothing · `reservation_audit` shadows `reservation` with no enforced key.

**Indexes**: the exclusion constraint creates the gist index on `(court_id, during)` that enforces the overlap rule. Add a plain btree on `reservation (court_id, starts_at)`, which is what the day bounded grid read actually filters on, plus `court (sort_order) where retired_at is null`, `reservation (created_by)` for the foreign key, and `reservation_audit (reservation_id, changed_at desc)`.

**State transitions**

A reservation has one transition and it is one way:

```
active ──cancel──▶ cancelled
```

`cancelled` is terminal. Rebooking the same slot creates a new row rather than reviving the old one, which keeps the audit honest and keeps the exclusion constraint simple.

Payment moves freely between `unpaid`, `partial`, `paid` and `waived`; money gets corrected in both directions and a state machine here would only get in the way.

A court moves from live to retired by setting `retired_at`, and back by clearing it.

**API surface**

All writes are Next.js Server Actions. There is no REST layer.

Times cross the wire as a calendar date plus a `HH:mm` local time in two separate fields, never as a single ISO string. The Server Action converts to UTC using `venue_settings.timezone`. A bare ISO string invites a client timezone bug that is invisible until somebody books across midnight.

| Action | Key inputs | Key outputs | Auth | Key errors |
| --- | --- | --- | --- | --- |
| `getSchedule` | `date: string` (req, an `Asia/Manila` calendar date) | courts, opening hours, blocks for that day, each block only `court_id`, `starts_at`, `ends_at`, `kind` | public, anon key, no Clerk token | `422` bad date, `422` date beyond the horizon or before the venue opened |
| `getStaffSchedule` | `date: string` (req) | the same day, with every reservation column including `customer_name`, `customer_phone`, `note`, `payment_status`, `amount` and `version` | active staff | `403` not active staff, `422` bad date |
| `createReservation` | `courtId: number` (req), `date: string` (req), `startTime: string` (req, `HH:mm`), `endTime: string` (req, `HH:mm`), `kind` (req), `customerName` (req when `kind` is `booking`), `customerPhone` (opt), `note` (opt), `paymentStatus` (opt), `amount` (opt) | the created row | active staff | `409` overlaps an existing active reservation, `403` not staff or date is in the past, `422` invalid input |
| `updateReservation` | `id: number` (req), `version: number` (req), plus any of `courtId`, `date`, `startTime`, `endTime`, `kind`, `customerName`, `customerPhone`, `note`, `paymentStatus`, `amount` | the updated row | active staff for a reservation ending today or later, `owner` for one already ended | `409` version stale or new range overlaps, `403` past reservation and caller is not an owner, `403` a non owner moving a future reservation into the past, `404` no such row |
| `cancelReservation` | `id: number` (req), `version: number` (req) | the cancelled row | active staff, `owner` for a past reservation | `409` version stale, `403`, `404` |
| `saveCourt` | `id: number` (opt, absent creates), `version: number` (req when editing), `name` (req), `sortOrder` (req), `note` (opt) | the saved row | `owner` | `409` version stale or `sort_order` taken, `403` not an owner, `422` invalid |
| `retireCourt` | `id: number` (req), `version: number` (req) | the retired row | `owner` | `409` `N` active bookings remain after now, `403`, `404` |
| `saveVenueSettings` | `version: number` (req), the four times, `slotMinutes`, `bookingHorizonDays` | the saved row | `owner` | `409` version stale, `403`, `422` close time not after open time |

Rules the actions follow, so no builder has to guess:

- **`id` and `created_by` are never changeable.** `court_id`, `kind` and the times all are, because staff genuinely move a booking to the other court or to a different hour.
- **The overlap conflict is recognised by SQLSTATE `23P01` together with the constraint name `reservation_no_overlap`**, and mapped to a typed `slot_taken` result. It is never surfaced as a raw database error and never swallowed.
- **`retireCourt` counts only `kind = 'booking'` rows.** A closure is not somebody who will turn up, so it does not block retiring a court.
- **`saveCourt` un retiring a court whose `sort_order` is now taken assigns the next free order** rather than failing, since the collision is an artifact of the partial unique index and not a decision the person made.
- **The grid refetches the whole day on any broadcast** rather than patching state from the payload. At two courts and one day that is cheap, and it cannot drift the way an incremental patch can. Scope feature 7 builds the listener; this spec only fixes the rule.

`getSchedule` is bounded by one calendar day and at most a handful of courts, so it needs no pagination. Any later list that is not day bounded, for example the reporting reads in scope feature 10, must paginate.

**Value sourcing**

| Action | Value produced or displayed | Source |
| --- | --- | --- |
| `getSchedule` | the calendar date being shown | an input param, defaulting to today in `venue_settings.timezone` |
| `getSchedule` | which weekday it is, so weekday or weekend hours apply | the input date read in `venue_settings.timezone`, never the server's or the reader's timezone |
| `getSchedule` | the open and close time for that day | `venue_settings.weekday_open/close` or `weekend_open/close`, chosen by that local weekday, where weekend means Saturday and Sunday |
| `getSchedule` | the slot rows of the grid | generated in TypeScript from the open time, `venue_settings.slot_minutes` and the close time, in `venue_settings.timezone` |
| `getSchedule` | the slot rows when `slot_minutes` does not divide the open to close window evenly | the trailing partial slot is dropped, so the grid never shows a slot that cannot be booked in full. With the seeded 60 minute slots this never arises |
| `getSchedule` | each cell's label | derived per AC-5 from the slot range and the active reservation rows overlapping it, read through the four columns granted to `anon` |
| `getStaffSchedule` | the customer, contact, note, payment state and amount per booking | the `reservation` columns directly, read with the staff client carrying the Clerk token |
| `getSchedule` | the next free time on a court | derived, the first slot from now forward with no overlapping active row; not stored |
| `getSchedule` | the court columns and their order | `court.name` and `court.sort_order` where `retired_at is null` |
| `getSchedule` | an out of hours marker on a booking | derived, an active row whose range falls outside that day's opening hours per AC-11 |
| any write | `changed_by` and `created_by` | `(select auth.jwt() ->> 'sub')`, the Clerk subject, the same claim the policies read |
| any write | `updated_at` | `now()` in the database, not a client clock |
| `createReservation` | `starts_at` and `ends_at` as UTC | the client sends an `Asia/Manila` local time plus the date; the Server Action converts using `venue_settings.timezone` before writing |
| `createReservation` | whether the date is inside the booking window | `venue_settings.booking_horizon_days` counted from today in `venue_settings.timezone` |
| `retireCourt` | the count of bookings in the way | a count of active `reservation` rows on that court where `kind = 'booking'` and `ends_at > now()` |
| any policy or count using "now" | the boundary between past and future | Postgres `now()` in UTC, always. The TypeScript day boundary is computed in `Asia/Manila` from the same instant, so a booking ending exactly at midnight Manila time falls on one side in both places and never on neither |
| any booking | the currency of `amount` | fixed as PHP, not stored, because there is one venue; display formats it |
| the grid | the `Selected` cell state | browser state only, never persisted; it is the seam player self booking will use later |

**Key invariants**

1. No two active reservations overlap in time on the same court. Enforced by `reservation_no_overlap`, so it holds even under two simultaneous writes.
2. `ends_at > starts_at` on every reservation.
3. A `booking` always has a `customer_name`; a `closed` row does not need one.
4. Exactly one `venue_settings` row can exist, enforced by the boolean primary key.
5. `sort_order` is unique among live courts.
6. Every reservation and court write matches the `version` it read and increments it. Zero rows affected means somebody else got there first.
7. Availability is never stored. Every cell label is computed from opening hours plus active reservations at read time.
8. `kind`, `status` and `payment_status` have exactly one definition, in TypeScript, mirrored into the check constraints by the migration.
9. Without a Clerk token, only `court_id`, `starts_at`, `ends_at` and `kind` on active reservations are readable, and only because those four columns are explicitly granted.

**Security model**

Anonymous, the public grid, holds the anon key and no Clerk token:

- `select` on `court` (live rows only) and on `venue_settings`, both granted by policy.
- On `reservation`, a **column level grant of exactly `court_id`, `starts_at`, `ends_at` and `kind`**, paired with a select policy of `using (status = 'active')`. Row level security guards rows, not columns, so the column grant is what keeps `customer_phone` and `amount` out of reach. Postgres refuses a column the role has no grant on, and unlike a view this leaves row level security enforced end to end, so there is no privileged object whose definition is the only thing standing between a careless edit and a leak.
- No `insert`, `update` or `delete` on any table, ever.

Signed in staff, a per request Supabase client carrying the Clerk token per spec 0001 rule 10:

- Two `security definer` helper functions in a private schema, per the Supabase policy performance guidance: `private.is_active_staff()` and `private.is_owner()`, each checking `(select auth.jwt() ->> 'sub')` against `staff` internally, with `execute` revoked from `anon` and `authenticated`. Policies call these once per statement rather than joining per row.
- `reservation`: full `select` on every column. `insert` and `update` when `private.is_active_staff() and (ends_at > now() or private.is_owner())`. On an update that predicate goes in **both** `using` and `with check`, which is what makes the rule complete: `using` tests the row as it stands, so a non owner cannot touch a booking that has already ended, and `with check` tests the row as it would become, so a non owner also cannot drag a future booking back into the past to escape the rule. When `ends_at <= now()`, `private.is_owner()` is required, which is the choice you made: a regular staff member cannot record a payment against yesterday.
- `court` and `venue_settings`: `select` for any active staff, `insert` and `update` for `private.is_owner()` only.
- `delete` is granted to nobody on any table. Reservations are cancelled, courts are retired.
- Every `update` policy carries both `using` and `with check`, per the gotcha already recorded in `supabase/AGENTS.md`.

Realtime, and the trap to avoid:

- The broadcast trigger must **not** call `realtime.broadcast_changes()`. That helper sends the whole row, which would put `customer_phone` and `amount` on a channel `anon` can read. The trigger builds a narrowed `jsonb` payload of `court_id`, `starts_at`, `ends_at`, `kind` and `status` and sends it with `realtime.send()` on the single topic `schedule`, private.
- It fires on insert, update and delete, and branches explicitly on which of `new` and `old` is null. Delete is granted to nobody today, so that branch is dead code now and is written anyway, because the day somebody grants delete is not the day to discover the trigger dereferences a null row.
- A policy on `realtime.messages` grants `anon` and `authenticated` `select` where `(select realtime.topic()) = 'schedule'` and `extension = 'broadcast'`, following the pattern already proven in the scaffold's smoke migration.

Regulated data: none. `customer_name` and `customer_phone` are ordinary personal data with no special regime, and they never leave the staff read path. Scope feature 12 owns telling players what is collected.

**Configuration required**

No new environment variables. Every value spec 0001 listed still applies, and the opening hours, slot length, booking window and timezone live in `venue_settings` rather than in configuration, so Ella can change them.

**Critical test scenarios**

- Happy path: staff create a booking on court 1 from 4pm to 5pm on a chosen date, and an already open public grid shows that cell as Booked with no reload, verifies **AC-2**, **AC-5**, **AC-9**.
- Failure case: two Server Actions book the same court and hour concurrently. Exactly one succeeds, the other returns a named conflict, and no third row exists, verifies **AC-2**.
- Failure case: a booking is submitted with a stale `version`. Zero rows are affected and the caller receives the fresh row, verifies **AC-8**.
- Failure case: retiring a court with three active future bookings is refused, and the message names the count, verifies **AC-7**.
- Data exposure: an anonymous client selecting `customer_phone`, `amount` or `note` from `reservation` is refused by Postgres, a select naming only the four granted columns succeeds, and the realtime payload it receives contains none of the hidden fields either, verifies **AC-4**.
- Auth and permission: a signed out visitor calling any write action is rejected by the policy, an active non owner editing a reservation that ended yesterday is rejected while the same edit on a future one succeeds, and a non owner moving a future reservation back into the past is rejected by the `with check` half of the same policy, verifies **AC-6**.
- Boundary: a booking sitting outside the opening hours after Ella shortens them still appears on the grid, marked out of hours, verifies **AC-11**.
- Boundary: the grid for a date is generated in `Asia/Manila`, so a slot at 11pm local does not slide into the next day, verifies **AC-5**.
- Cancellation: cancelling a booking frees the slot for an immediate rebooking and the cancelled row is still readable, verifies **AC-3**, **AC-10**.

## Build plan

Tracer Bullet, so the order proves one narrow thread all the way through before anything is thickened: the value lists, one migration carrying the whole target model, then a read, then a write, watched live in a second browser.

1. [x] Define `kind`, `status` and `payment_status` once in `lib/schedule/constants.ts`, and build the Zod schemas from those arrays, satisfies **AC-12**.
2. [x] Write one migration creating `btree_gist`, `staff`, `court`, `reservation`, `venue_settings` and `reservation_audit`, with every check constraint, the generated `during` column, the `reservation_no_overlap` exclusion constraint, and the indexes listed above. The check constraint values are copied from step 1, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-10**.
3. [x] In the same migration, add the private helper functions, the role grants including the four column grant on `reservation` for `anon`, and the row level security policies for anon and staff, with the ended test in both `using` and `with check` on the staff update policy, satisfies **AC-4**, **AC-6**.
4. [x] In the same migration, add the narrowed broadcast trigger using `realtime.send()` on the `schedule` topic, and the `realtime.messages` policy for that topic, satisfies **AC-4**, **AC-9**.
5. [x] In the same migration, add the `reservation_audit` trigger, satisfies **AC-8**.
6. [x] In the same migration, seed two courts and the single `venue_settings` row with the real hours, weekdays 06:00 to 22:00 and weekends 06:00 to 23:00, satisfies **AC-1**.
7. [x] Delete `supabase/migrations/20260903023010_realtime_smoke.sql` and `app/smoke/`, and drop the smoke table in the new migration. The scaffold's throwaway has served its purpose and is now the only thing in the schema nothing reads, satisfies **AC-1**.
8. [x] Apply the migration with `npx supabase db push`, then run `npx supabase db advisors` and fix anything it raises. There is no expected warning to explain away, which is one reason the column grant was chosen over a view, satisfies **AC-1**, **AC-4**.
9. [x] Generate TypeScript types from the schema into `lib/supabase/database.types.ts` and wire both clients to them, closing the follow up spec 0001 left open, satisfies **AC-12**.
10. [x] Build `lib/schedule/grid.ts`: given a date, the settings row, the courts and the blocks, produce the slot rows and each cell's label, all computed in `venue_settings.timezone`, including the out of hours case. Pure functions, unit testable with no database, satisfies **AC-5**, **AC-11**.
11. [x] Build the two read paths: `getSchedule` with `publicSupabase()`, naming the four granted columns explicitly, and `getStaffSchedule` with `staffSupabase()` reading every column. Both feed the same `grid.ts`, satisfies **AC-4**, **AC-5**.
12. [x] Build the write path as Server Actions per the API surface, each calling `requireStaff()` first, validating with Zod, then writing conditionally on `version` and mapping SQLSTATE `23P01` on `reservation_no_overlap` to a typed `slot_taken` result, satisfies **AC-2**, **AC-6**, **AC-7**, **AC-8**.
13. [ ] Prove the thread: a signed in staff member books a slot and a second browser on the public grid sees the cell turn Booked with no reload, and a concurrent duplicate booking is rejected, satisfies **AC-2**, **AC-9**.

Scope features 6, 7 and 8 build the screens on top of this. They add no tables.

## Consequences

**Positive**

- A double booking is impossible, not merely unlikely. The guarantee sits in the database, so it holds no matter which write path is added later, including player self booking.
- One source of truth. There is no stored availability to drift out of step with the bookings, and no scheduled job generating rows for future days.
- Changing to 30 minute slots, or changing the opening hours, is a settings edit. Neither is a migration.
- The `reservation` table is the history. Scope features 9 and 10 report straight off it with no second table and no backfill, and cancelled rows mean Ella can see how often bookings fall through.
- Player self booking, which is deferred today, adds a `booked_by` column and one policy rather than a new model.
- The audit table means a change to a past booking, which an owner is allowed to make, always leaves a trace.

**Negative and tradeoffs**

- **A regular staff member cannot record a payment on a booking that has already ended.** You chose owner only editing of the past, and money is often settled afterwards, so this will bite at the desk. The fix, if it does, is a narrow policy allowing active staff to change only `payment_status`, `amount` and `note` on a past booking. It is a follow up, deliberately not built now.
- **Deriving the grid is real code.** Slot generation, weekday selection, and the out of hours case all live in TypeScript and all have to handle `Asia/Manila` correctly. A pre generated cell table would have made the read trivial. This is the cost of not keeping a second copy of the truth.
- **The public read must name its columns.** Because the anonymous grant is column level, `select *` as `anon` fails rather than returning too much. That is the safer failure, and it means the public read path cannot be written casually and every new public column needs a deliberate `grant`.
- **The narrowed broadcast trigger is hand written.** It cannot use `realtime.broadcast_changes()`, which is what the scaffold's smoke migration uses and therefore what a build is most likely to copy. Getting this wrong publishes customer phone numbers to anonymous listeners.
- **Exclusion constraints and `tstzrange` are one more Postgres feature to hold in your head**, and the conflict they raise arrives as a constraint violation that the Server Action has to recognise by name and translate.
- **This spec records a product change.** The four state live board the scope describes is gone, replaced by a schedule. Scope features 6, 7, 8, 9 and 10 all need rewording before they are built.

**Neutral**

- Primary keys are `bigint generated always as identity` rather than the `uuid` the scaffold's smoke table used, following the installed Postgres skill. Sequential ids avoid index fragmentation and are smaller, and there is no reason here to hide how many bookings exist.
- `cancelled` and `retired_at` are domain states, not soft deletes. Cancelled rows are excluded from the exclusion constraint by its `where` clause, so they never block a new booking, and retired courts keep their history.
- `numeric(10,2)` for money means exact decimal arithmetic, so a month of bookings sums without drift.
- Grid reads are bounded by one day, so pagination is not needed yet. Reporting in feature 10 is not bounded and will need it.

## Follow-up

- [ ] Rework the scope with `/scope`. This spec changes the product from a live status board to a booking schedule. Features 6, 7, 8, 9 and 10 all describe the old shape, and "Court reservations" should move out of Deferred into the main plan.
- [ ] Decide whether an active staff member should be allowed to change `payment_status`, `amount` and `note` on a booking that has already ended. Named as a tradeoff above; likely to come up in the first week of real use.
- [ ] There is no rate limit on the public grid read. Scope feature 7 owns the public page and should add one before the link is shared publicly.
- [ ] Decide how long `customer_phone` is kept. Nothing purges it today, and scope feature 12 will have to state a retention answer on the privacy page.
- [ ] Spec 0001's explicit deferral about court state values is now resolved here as `kind`, `status` and `payment_status`, and its `staff` table constraint is honoured. Its follow up about generating TypeScript types is folded into build plan step 9. Worth a note on 0001 when the scope is reworked.
- [ ] Scope feature 5, staff sign in, must create the `staff` row with a `role` and `is_active`, because every policy here depends on it. Until it exists, no write path can be tested against a real account.
- [ ] The `vitest` skill is installed and used by the existing tests but is not listed in `supabase/AGENTS.md`. Not urgent, and it belongs in the root `## Agent skills` section, which it already is.
