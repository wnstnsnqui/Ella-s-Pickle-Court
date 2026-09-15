# 0007. Courts and opening hours

**Date**: 2026-09-15
**Status**: Accepted

## Summary

Ella gets one page, `/staff/settings`, where she adds, renames, reorders, retires and restores courts and changes the opening hours, the slot length and how far ahead staff may book. Nothing is touched in the database by hand any more. The three Server Actions spec 0002 built already do most of the writing; this spec adds one migration (a name uniqueness rule, a midnight closing time, a small Postgres function that reorders every court in one go, and a broadcast trigger so a court or hours change reaches every open board the way a booking does), one new Server Action for the reorder, a read for the page, and the screen itself, built from the shell, sheets, dialog and form patterns the staff board already uses. Only an owner may open it; Postgres, not the page, is what refuses everybody else.

## Requirements

**User stories**

- As Ella, I want to add a court when we build one and retire a court when it is out of use, so that both boards match the courts we actually have.
- As Ella, I want to rename and reorder the courts, so that the columns read the way we talk about them at the desk.
- As Ella, I want to change the opening hours, the slot length and how far ahead staff may book, without a deploy or a database editor, so that the grid matches how the venue runs this season.
- As Ella, I want to be stopped from retiring a court that still has bookings, and told how many, so that no customer turns up to a court that is gone.
- As Ella, I want to be warned before an hours change strands bookings outside the new hours, so that it is a choice and not a surprise.
- As a staff member or a player with a board open, I want a court or hours change to show up by itself, so that I am never reading a grid with the wrong columns or the wrong hours.

**Acceptance criteria** (the contract, each independently checkable)

- **AC-1**: The owner screen lives at `/staff/settings`. It is already inside the `/staff/` matcher in `proxy.ts`, so a signed out visitor is redirected to `/sign-in` and returned there afterwards. The page reads `currentStaff()` on the server: a signed in person whose role is not `owner`, or whose `is_active` is false, is redirected to `/staff` before any settings read happens. The staff menu shows a Settings link (icon only on a phone, like the Schedule link) only when the current staff member is an active owner. The page is marked `noindex`, like `/staff`.
- **AC-2**: The page is three sections, top to bottom: Courts, Opening hours, and Retired courts. Retired courts is a collapsed disclosure and renders only when at least one retired court exists. The page reads through one function, `getOwnerSettings()`, on `staffSupabase()`, returning every court (live and retired, each with its `version`) and the `venue_settings` row with its `version`. While that read streams, `app/staff/settings/loading.tsx` shows a skeleton of the three sections; a failed read shows an error notice whose Retry is a client button calling `router.refresh()`, which runs the server read again.
- **AC-3**: The Courts section lists live courts in `sort_order`, each row showing the name, the note when there is one, an Edit control, Move up and Move down controls, and Retire. An Add court button opens `CourtSheet` with a name (required, 1 to 40 characters after trimming) and a note (optional, up to 200 characters). Submitting calls `saveCourt` with no `id` and no `sortOrder`; the action computes `sort_order` as the highest live order plus one (zero when there are no live courts), so a new court always lands last. On success the sheet closes, the row appears at the end, and a toast confirms.
- **AC-4**: Edit opens the same `CourtSheet` prefilled with the court's name and note and saves through `saveCourt` with the court's `id`, `version` and its current `sortOrder` resent unchanged (the sheet never moves a court; only reorder does). A live court's name is unique, ignoring case and surrounding spaces, enforced by a partial unique index `court_live_name_idx` on `lower(btrim(name)) where retired_at is null`. A clash is returned as a `conflict` with reason `name_taken` and shown on the name field inside the sheet, which stays open with the typed name. When the row changed under the editor (`version_stale`), the sheet reloads the fresh values, says the court changed while you were editing, and saving again writes against the new version.
- **AC-5**: Move up and Move down swap a court with its neighbour. The first row's Move up and the last row's Move down are disabled. A press moves the row at once (optimistic), locks every order control until the write returns, and calls a new Server Action `reorderCourts` with the whole live list in its new order, each entry carrying `id` and `version`. The action calls a new Postgres function `public.reorder_courts(ids bigint[], versions integer[])` that, in one transaction, parks every listed court at a negative order, then writes each court's position as its `sort_order`, bumps its `version` and sets `changed_by`. It raises `stale_version` if any row's version does not match, and raises `insufficient_privilege` when a phase updates fewer rows than were listed (the owner policy made the update touch nothing); `describeDatabaseError` maps those to `version_stale` and `forbidden`. In both cases nothing is written. On success the list keeps its new order; on any failure it reverts, refetches, and shows the message. Every order control has an accessible name that includes the court's name (Move `<name>` up), and a polite live region announces "`<name>` moved to position N of M" after a move.
- **AC-6**: Retire opens `ConfirmDialog` naming the court, with Keep as the safe choice. Confirming calls `retireCourt`. When active bookings end after now on that court, the action refuses with `court_has_bookings` and the count; the dialog shows the action's own message ("That court still has N bookings ahead of it.") and stays open. On success the court leaves the Courts list, appears under Retired courts, and a toast confirms.
- **AC-7**: Each retired court row shows its name and the date it was retired, in `Asia/Manila`, and a Restore control. Restore is one tap, no confirmation, calling `saveCourt` with `restore: true` and the court's current name, note, `sortOrder` and `version`. The spec 0002 rule stands: the court keeps its old order unless another live court now holds it, in which case it takes the next free order.
- **AC-8**: The Opening hours form has weekday open and close, weekend open and close, slot length and booking horizon. The four time fields are `Select` controls offering every 30 minutes from `00:00` to `23:30` for open times and from `00:30` to `24:00` for close times, shown in the compact 12 hour style the grid uses through `formatSlotLabel`, which gains a special case so `24:00` reads as Midnight rather than 12pm. Slot length is a `Select` of 30, 60 and 90 minutes. Booking horizon is a number from 1 to 365. Save is disabled until a field differs from what was loaded. Submitting calls `saveVenueSettings` with every field and the `version`. A new `closeTimeSchema` accepts `HH:mm` up to and including `24:00`; `localTimeSchema` is unchanged, so `24:00` is never a valid open or booking start time. Each close time must be later than its open time, checked by Zod on the way in and by the existing Postgres checks, plus a new check `venue_settings_open_before_midnight_check` that keeps both open times below `24:00`.
- **AC-9**: Before writing, `saveVenueSettings` counts the active bookings (`kind = 'booking'`, `status = 'active'`, `ends_at > now()`) whose range falls wholly or partly outside the proposed hours for the booking's own weekday, computed in `venue_settings.timezone` in TypeScript with the helpers in `lib/time.ts`. When that count is above zero and the input does not carry `acknowledge: true`, the action writes nothing and returns a `conflict` with reason `bookings_outside_hours` and the count. The form shows `ConfirmDialog` reading "N future bookings fall outside these hours. Save anyway?" with Save anyway and Keep editing, which resends the same input with `acknowledge: true`. Bookings beyond a shortened horizon are neither counted nor blocked; they become reachable again as their day approaches. Closures are never counted.
- **AC-10**: A close time of `24:00` works end to end. `zonedTimeToUtc` in `lib/time.ts` today refuses anything past `23:59` and `buildGrid` calls it with the close time, so `zonedTimeToUtc(date, "24:00", timezone)` is widened to resolve to the first instant of the next local day. With that, `openingHours` and `buildGrid` in `lib/schedule/grid.ts` produce a last slot that ends at midnight, and a booking or closure ending at midnight stores correctly. `DayNav`, `dayBoundsUtc` and the midnight day roll from spec 0006 are unchanged.
- **AC-11**: A migration adds one `security definer` trigger function, `public.schedule_meta_broadcast()`, with `set search_path = ''`, attached after insert or update on `court` and after update on `venue_settings`. It sends a payload of exactly `op`, `table` and `id` on the existing private `schedule` topic, as event `court_changed` or `settings_changed`. `useScheduleChannel` subscribes to both events beside `reservation_changed` and requests a read, never patching state from the payload. As a result, both boards show a new, renamed, reordered, retired or restored court and a changed set of hours or horizon without a reload.
- **AC-12**: When a board's refetch is refused because the day it is showing is now beyond the horizon, the board replaces its URL with no `date`, reads today, and shows a toast saying the day is no longer open for booking. `TransportResult` in `use-schedule-channel.ts` gains an optional `reason: "out_of_range"` on its failure shape; the public transport sets it from the `422` body of `GET /api/schedule` and the staff transport from the `invalid` result of `refreshStaffSchedule`, so the hook can tell this apart from any other failure and never shows the retry error state for it.
- **AC-13**: Every write from the settings page is conditional on the `version` the page last read and records `changed_by`, through the existing actions. The page holds no live subscription. A `version_stale` result from any write refetches `getOwnerSettings()`, replaces the list and the form's loaded values with the fresh rows, and says in a toast that somebody else changed the settings. A `forbidden` result (a role changed under an open tab) is shown as a toast, never swallowed.
- **AC-14**: The sheets and dialogs follow the spec 0005 viewport rule: from the bottom on a phone, from the right at 768 pixels and wider. Every control is reachable and operable by keyboard, the retired section is a real disclosure button with `aria-expanded`, form errors are tied to their fields, and every new surface meets WCAG 2.2 AA contrast in both themes.
- **AC-15**: Proven live on the real Supabase project with `npx supabase db advisors` clean after the migration: an owner adds a court, renames it, moves it up, sets the weekday close to Midnight, then retires a court that has a future booking and is refused with the count, while a signed out browser on `/` and a signed in staff browser on `/staff` reflect each accepted change with no reload. A non owner staff account opening `/staff/settings` lands on `/staff`.

## Decision

**Chosen option**: Option 1: One page at `/staff/settings`, up and down buttons over a one transaction reorder function, and the existing `schedule` topic carrying two more events.

One scrolling page for everything an owner changes, built from the parts the staff board already proved, with a small migration that closes the three gaps spec 0002 left open for this feature: a unique name, a midnight close, and a way for a court or hours change to reach open boards.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `react-hook-form` (`pproenca/dot-skills`, `.agents/skills/react-hook-form/`) · `zod` (`pproenca/dot-skills`, `.agents/skills/zod/`) · `shadcn` (`shadcn/ui`, `.agents/skills/shadcn/`) · `clerk-nextjs-patterns` (`clerk/skills`, `.agents/skills/clerk-nextjs-patterns/`) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`) · `tailwind-4-docs` (`lombiq/tailwind-agent-skills`, `.agents/skills/tailwind-4-docs/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

Calls made here rather than asked, each with its runner up:

- **`reorderCourts` takes the whole live list** as `{ courts: [{ id, version }] }` in display order, rather than a `(id, direction)` pair. The list is exactly what is on screen, so the result can never differ from what Ella saw, and the function has one shape for a single swap and any future drag reorder. Runner up: `(id, direction)`, which would need the server to reread the order and reason about neighbours.
- **`getOwnerSettings()` is a plain server read on `staffSupabase()`**, returning `{ courts, settings }` with versions, not a widening of `getStaffSchedule`. The settings page needs retired courts, which no board wants. Runner up: adding a `retired` list to the staff schedule read, which would send retired courts to every staff board refetch for nothing.
- **The timezone stays off the form.** `venue_settings.timezone` exists as a column, but changing it would shift every stored booking's local time at once; that is a migration level decision, not a Tuesday afternoon setting. Runner up: a read only line showing the timezone, which adds nothing Ella can act on.
- **The retired date shows on the retired row** rather than a full history, formatted with `formatAtVenue`. Runner up: nothing but the name, which makes it hard to tell an old retirement from a mis tap a minute ago.
- **`saveCourt` keeps its shape and gains two small widenings**: `sortOrder` becomes optional on create (the action computes the end position) and the name clash maps to a new `ConflictReason` of `name_taken`. `bookings_outside_hours` joins the same union for the settings action. Runner up: a separate `addCourt` action, which would duplicate the validation and the audit fields.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**

No new tables. Spec 0002's `court`, `venue_settings`, `reservation` and `staff` stay as they are, with these additions in one migration:

| Object | Addition |
| --- | --- |
| `court` | Partial unique index `court_live_name_idx` on `(lower(btrim(name))) where retired_at is null`. `court_sort_order_check` is dropped and recreated as `sort_order between -10000 and 9999`, because the reorder function parks rows at a negative order inside its transaction; the Zod schema stays at 0 to 9999, so application code can never write a negative and no reader ever sees one. Trigger `court_broadcast_changes`, after insert or update, for each row, calling `public.schedule_meta_broadcast()`. |
| `venue_settings` | Check `venue_settings_open_before_midnight_check`: `weekday_open < time '24:00' and weekend_open < time '24:00'`. The existing `close > open` checks already allow `24:00` as a close, because Postgres `time` accepts `24:00:00`. Trigger `venue_settings_broadcast_changes`, after update, for each row, calling the same function. |
| `public.reorder_courts(ids bigint[], versions integer[])` | `returns void`, `language plpgsql`, `security invoker` (row level security still applies to every update inside it), `set search_path = ''`. Refuses with `22023` (invalid parameter value) when the arrays differ in length or hold a duplicate id. Positions come from `unnest(ids, versions) with ordinality as t(id, version, position)`, so `position` is 1 based. Locks the listed rows with `for update`, checks every `version` and raises `stale_version` (a custom exception with `errcode = 'P0002'`, mapped by `describeDatabaseError` to the `version_stale` conflict) on the first mismatch. Then two updates: every listed court to `sort_order = -position`, then to `sort_order = position - 1`, `version = version + 1`, `changed_by = (select auth.jwt() ->> 'sub')`. After each update it reads `row_count` through `get diagnostics` and raises `insufficient_privilege` (`errcode = '42501'`, already mapped to `forbidden`) when fewer rows than listed were touched, which is what a non owner sees: the owner policy makes the update affect nothing and Postgres alone would report success. `execute` granted to `authenticated`, revoked from `anon` and `public`. |
| `public.schedule_meta_broadcast()` | `returns trigger`, `security definer`, `set search_path = ''`, like `reservation_broadcast()`. Sends `jsonb_build_object('op', lower(tg_op), 'table', tg_table_name, 'id', coalesce(new.id::text, old.id::text))` with `realtime.send(payload, event, 'schedule', true)`, where `event` is `court_changed` for `court` and `settings_changed` for `venue_settings`. Never a column beyond identity. |

Relationships are unchanged: `court` 1:N `reservation` · `staff` 1:N `court` through `changed_by` · `venue_settings` a singleton. Court rows are never deleted; a court is live (`retired_at is null`) or retired.

**State transitions**

`court`: live → retired (Retire, refused while future bookings exist) → live (Restore, order kept or moved to the next free one). No other states. `venue_settings` has one row and no lifecycle.

**API surface**

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
| --- | --- | --- | --- | --- | --- |
| `getOwnerSettings` | server read | none | `courts: CourtRow[]` (live and retired, each with `version`, `retired_at`), `settings: VenueSettingsRow` with `version` | active owner (`staffSupabase()`, policies apply) | `failed` when the settings row is missing |
| `saveCourt` (existing, widened) | Server Action | `id` (opt), `version` (req when `id`), `name` (req), `note` (opt), `sortOrder` (opt on create, req on edit), `restore` (opt) | the saved `CourtRow` | owner (policy) | `409 name_taken`, `409 version_stale`, `409 sort_order_taken`, `403`, `422` |
| `retireCourt` (existing) | Server Action | `id`, `version` | the retired `CourtRow` | owner | `409 court_has_bookings` with `count`, `409 version_stale`, `403`, `404` |
| `reorderCourts` (new) | Server Action | `courts: { id, version }[]` in display order, 1 to 50 entries, ids unique | `ok` with the fresh live court list | owner | `409 version_stale`, `403`, `422` |
| `saveVenueSettings` (existing, widened) | Server Action | `version`, `weekdayOpen`, `weekendOpen` (`localTimeSchema`), `weekdayClose`, `weekendClose` (`closeTimeSchema`), `slotMinutes`, `bookingHorizonDays`, `acknowledge` (opt) | the saved `VenueSettingsRow` | owner | `409 bookings_outside_hours` with `count`, `409 version_stale`, `403`, `422 close not after open` |
| `GET /staff/settings` | page | none | the page, or a redirect | active owner | redirect to `/sign-in` (proxy) or `/staff` (page) |

**Value sourcing**

| Action | Value produced or displayed | Source |
| --- | --- | --- |
| `GET /staff/settings` | whether the visitor may see the page | `currentStaff()`: `staff.role = 'owner'` and `staff.is_active`, decided in spec 0004 |
| `StaffMenu` | whether to show the Settings link | the same `currentStaff()` row |
| `getOwnerSettings` | the live court list and its order | `court` rows where `retired_at is null`, ordered by `sort_order` |
| `getOwnerSettings` | the retired court list and each retired date | `court` rows where `retired_at is not null`, `retired_at` shown with `formatAtVenue`, which formats in the `VENUE_TIMEZONE` constant (the same `Asia/Manila` the column holds) |
| `getOwnerSettings` | the form's loaded values | `venue_settings` columns, times trimmed with `trimSeconds` |
| `saveCourt` (create) | the new court's `sort_order` | derived: `max(sort_order) + 1` over live courts, `0` when none |
| `saveCourt` (create) | `changed_by` | `requireStaff().staffId`, decided in spec 0002 |
| `saveCourt` (edit) | whether the name is taken | the `23505` on `court_live_name_idx`, mapped by `describeDatabaseError` |
| `saveCourt` (restore) | the restored court's order | its own `sort_order` unless a live court holds it, then the next free order, decided in spec 0002 |
| `reorderCourts` | each court's new `sort_order` | derived: its 1 based `position` from `unnest with ordinality`, written as `position - 1` |
| `reorderCourts` | whether the caller was allowed | `row_count` after each update inside `reorder_courts` compared to the list length; fewer rows means the owner policy refused |
| `reorderCourts` | whether the list is stale | `reorder_courts` compares every submitted `version` to the row |
| `retireCourt` | the count of bookings in the way | active `reservation` rows on that court, `kind = 'booking'`, `ends_at > now()`, decided in spec 0002 |
| `saveVenueSettings` | which hours apply to a booking | its weekday from `calendarDateInZone(starts_at, timezone)` and `isWeekend`, the proposed weekday or weekend pair |
| `saveVenueSettings` | whether a booking is outside those hours | `localTimeInZone(starts_at) < open` or `localTimeInZone(ends_at) > close`, with an end of `00:00` on the following local day read as `24:00`; multi day rows are outside by definition |
| `saveVenueSettings` | the count in the warning | the number of such rows among active bookings with `ends_at > now()` |
| `saveVenueSettings` | whether to write despite the count | the `acknowledge` input |
| `openingHours` and `buildGrid` | the last slot's end when close is `24:00` | `timeToMinutes("24:00") = 1440`, the slot loop is unchanged |
| `zonedTimeToUtc` | the instant of `24:00` | derived: the next calendar day at `00:00` in the same zone, a widening of its current `HH:mm` check |
| `formatSlotLabel` | the label for `24:00` | a special case returning Midnight; every other time keeps the compact 12 hour rule |
| Settings page error state | what Retry does | `router.refresh()`, which runs `getOwnerSettings()` again on the server |
| `useScheduleChannel` | when to refetch for a court or hours change | the `court_changed` and `settings_changed` events on the `schedule` topic |
| both boards | what to do when the shown day fell past the horizon | `reason: "out_of_range"` on the failure shape of `TransportResult`, set by each transport from its own error; then `todayInZone(timezone)` |
| Opening hours form | the time options and their labels | every 30 minutes, labelled by `formatSlotLabel`, with `24:00` labelled Midnight |
| Retire dialog and hours dialog | the sentence shown | the action's `message` for `court_has_bookings`; "N future bookings fall outside these hours. Save anyway?" built by the form from the returned `count` |
| Reorder live region | the announcement | "`<name>` moved to position N of M", from the optimistic list |
| Opening hours form | whether Save is enabled | react-hook-form `isDirty` against the loaded values |

**Key invariants**

1. No two live courts share a name, ignoring case and outer spaces (`court_live_name_idx`). Retired courts may share a name with a live one, so a court can be retired and a new one given the same name.
2. `sort_order` is unique among live courts (spec 0002, invariant 5). A reorder is all or nothing: after `reorder_courts` returns, the live courts are numbered `0..n-1` in the submitted order, or nothing changed. A negative `sort_order` exists only inside that transaction; application code validates 0 to 9999 and never writes one.
3. An open time is always before `24:00`, and each close time is after its open time. `24:00` is legal only as a close time and as a closure or booking end.
4. Every write from the settings page carries the `version` last read and records `changed_by`. Zero rows means somebody else got there first, and the page shows the fresh state (spec 0002, AC-8).
5. A court with an active booking ending after now cannot be retired (spec 0002, AC-7).
6. A court or settings change is broadcast by the database, never by the application, and the payload never carries more than identity.
7. The settings page and both boards never patch state from a broadcast; they refetch.

**Security model**

- Reads and writes on `court` and `venue_settings` are governed by the spec 0002 policies: any active staff may read, only `private.is_owner()` may insert or update. `reorder_courts` is `security invoker`, so those same policies decide every row it touches. The page's `currentStaff()` redirect is a courtesy, not the enforcement.
- `execute` on `reorder_courts` is granted to `authenticated` and revoked from `anon` and `public`. `schedule_meta_broadcast()` is `security definer` because it must write to `realtime.messages`; `execute` on it is revoked from `anon` and `authenticated` like `reservation_broadcast()`.
- The broadcast payload carries `op`, `table` and `id` only. Court names and hours are already anon readable, but the trigger stays column free so no future column on `court` needs a review of it.
- `getOwnerSettings()` runs on `staffSupabase()` built per request. Nothing here touches `publicSupabase()` or the service role key.
- No customer data is read by the page. `saveVenueSettings` reads `court_id`, `starts_at`, `ends_at`, `kind` and `status` for the count and nothing else.

**Configuration required**

None. No new environment variable, credential or dashboard setting. The migration applies with `npx supabase db push`.

**Critical test scenarios**

- Happy path: an owner adds a court, and a signed out browser on `/` and a staff browser on `/staff` show the new column with no reload, verifies **AC-3**, **AC-11**, **AC-15**.
- Happy path: an owner sets the weekday close to Midnight and saves; the grid's last row ends at midnight and a booking can be made in it, verifies **AC-8**, **AC-10**.
- Failure case: `reorder_courts` called with one stale version writes nothing and raises `stale_version`; the list reverts and reloads, verifies **AC-5**, **AC-13**.
- Failure case: two live courts named `court 1` and `Court 1 ` cannot coexist; the second save shows the clash on the name field with the sheet open, verifies **AC-4**.
- Failure case: retiring a court with two future bookings is refused, the dialog says two and stays open; after those bookings are cancelled the same retire succeeds, verifies **AC-6**.
- Failure case: shortening weekday hours past three future bookings returns `bookings_outside_hours` with 3; saving with `acknowledge` writes and those bookings appear out of hours on the grid, verifies **AC-9**.
- Failure case: a staff board showing day 30 while the horizon drops to 14 lands on today with a toast rather than an error state, verifies **AC-12**.
- Auth and permission: a non owner staff account opening `/staff/settings` lands on `/staff`, and a non owner calling `reorderCourts` or `reorder_courts` directly gets `forbidden` from the policy, verifies **AC-1**, **AC-5**.
- Accessibility: every order button is reachable by keyboard and named with the court, the retired disclosure reports `aria-expanded`, and every pair meets AA in both themes, verifies **AC-14**.

## Build plan

Tracer Bullet: the first slice runs the whole path once, migration to page to a second browser updating by itself, on the simplest write there is, adding a court. Everything after thickens that path.

1. [x] One migration: `court_live_name_idx`, the widened `court_sort_order_check`, `venue_settings_open_before_midnight_check`, `reorder_courts` with its row count checks and grants, `schedule_meta_broadcast()` and its two triggers. Regenerate `lib/supabase/database.types.ts`, apply with `db push`, check with `db advisors`, and add `name_taken` and `bookings_outside_hours` to `ConflictReason` and `describeDatabaseError`, satisfies **AC-4**, **AC-5**, **AC-8**, **AC-11**.
2. [x] The thin thread: `useScheduleChannel` subscribes to `court_changed` and `settings_changed`; `getOwnerSettings()`; the `/staff/settings` page with the owner redirect, `noindex`, and `loading.tsx`; the Settings link in `StaffMenu`; the Courts section with `CourtSheet` for add, `saveCourt` computing the end position; then proven live: a court added on a phone appears as a column in a second browser on `/` with no reload, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-11**.
3. [x] The rest of the court list: Edit through the same sheet with the name clash on the field and the stale version reload; `reorderCourts` and the optimistic, locked list with its live region; Retire through `ConfirmDialog` with the count kept in the dialog; the Retired courts disclosure with the date and Restore, satisfies **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-13**.
4. [x] Opening hours: `closeTimeSchema`, the `24:00` path through `timeToMinutes`, `openingHours`, `buildGrid`, the widened `zonedTimeToUtc` and the Midnight case in `formatSlotLabel`, with unit tests; the form with its selects, dirty tracking and version; the outside hours count in `saveVenueSettings` as a pure, tested function over rows and the two step save with `ConfirmDialog`, satisfies **AC-8**, **AC-9**, **AC-10**, **AC-13**.
5. [x] Finish: the `reason` field on `TransportResult`, `out_of_range` set by both boards' transports, and the go to today rule in the hook; the viewport rule for sheets and dialogs; keyboard, names and contrast checked in both themes; then the full live proof of AC-15 on the real project, satisfies **AC-12**, **AC-14**, **AC-15**.

## Consequences

**Positive**

- Ella changes courts and hours herself, and the change reaches every open board within a second, the same way a booking does. The database editor is no longer part of running the venue.
- The three write paths spec 0002 built are finally used by a screen, which closes the last untested corner of that spec.
- A midnight close is possible, which retires a Deferred item and a spec 0005 follow up.
- The reorder is one transaction, so a half applied order can never reach the grid, and the same function will serve a drag reorder if one is ever wanted.
- The broadcast trigger carries identity only, so adding a column to `court` never needs a privacy review of the realtime channel.

**Negative and tradeoffs**

- Up and down buttons are slower than drag for a venue with many courts. At two to six courts that is a press or two; at twenty it would grate. Drag can be added later on top of the same `reorderCourts`.
- The settings page does not listen for broadcasts. Two owners editing at once find out on save, through a stale version, not while typing. That is the right trade for a page open a minute a month, but it is a trade.
- The outside hours count runs in TypeScript on every settings save, reading every active future booking. At a few courts and a horizon of a year that is a few thousand rows at most; a venue ten times bigger should move the count into SQL.
- `24:00` is now a valid string in one schema and not another. Every place that parses a close time has to use `closeTimeSchema`, and a booking end of `24:00` needs the next day rule in `zonedTimeToUtc`. The tests in step 4 are what keep this honest.
- The `stale_version` exception from `reorder_courts` is a second way a version conflict surfaces (the first is zero rows on an update). `describeDatabaseError` has to map it so the page sees one `version_stale`.
- A reorder fires `court_changed` twice per court, once for the parking update and once for the final one, all inside one transaction. The hook's 300 millisecond coalescing turns that into one read per board, so it is noise on the channel and nothing more.
- `court_sort_order_check` now allows a negative, which loosens a spec 0002 constraint by a little. The Zod schema is what keeps the application at 0 to 9999.

**Neutral**

- A third `ConflictReason` pair (`name_taken`, `bookings_outside_hours`) joins the union. Every consumer that switches on the reason should have a default branch already.
- `saveCourt` on create no longer requires `sortOrder`. Existing callers that pass it still work; the action prefers the computed end position only when it is absent.
- Retiring a court while a staff board has it selected is already handled: the refetch prunes the selection with the spec 0005 toast.
- The venue name and the timezone remain outside this page, as spec 0003 and this spec decided.

## Follow-up

- [ ] `supabase/AGENTS.md` says court changes broadcast through `realtime.broadcast_changes()`. Since spec 0002 the real pattern is a narrowed `realtime.send()` on the `schedule` topic, and this spec adds a second trigger in that style. Worth fixing that line with `/sync` once this ships.
- [ ] The Deferred item "Closing at midnight" and the spec 0005 follow up about `24:00` are resolved here; drop them from the scope when this feature closes.
- [ ] Drag reorder on a desktop is deliberately not built. If Ella asks, it goes on top of `reorderCourts` with a keyboard fallback, and needs a decision on the library.
- [ ] A venue with many more bookings than this one would want the outside hours count as a SQL function. Not now.
- [ ] The staff management screen (roles, switching a leaver off) stays in Deferred; `/staff/settings` is the natural home for it when it is specced.
