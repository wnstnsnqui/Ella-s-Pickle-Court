# 0007. Courts and opening hours

**Date**: 2026-09-15, revised 2026-09-22
**Status**: Accepted. The per day opening hours revision of 2026-09-22 (**AC-16** to **AC-25**) is **Accepted**, built and verified on 2026-09-23.

## Summary

Ella gets one page, `/staff/settings`, where she adds, renames, reorders, retires and restores courts and changes the opening hours, the slot length and how far ahead staff may book. Nothing is touched in the database by hand any more. The three Server Actions spec 0002 built already do most of the writing; this spec adds one migration (a name uniqueness rule, a midnight closing time, a small Postgres function that reorders every court in one go, and a broadcast trigger so a court or hours change reaches every open board the way a booking does), one new Server Action for the reorder, a read for the page, and the screen itself, built from the shell, sheets, dialog and form patterns the staff board already uses. Only an owner may open it; Postgres, not the page, is what refuses everybody else.

**Revision, 2026-09-22.** The venue opens later on a Friday night than on the other weekdays, and the hours model could not say so: it held one pair of times for weekdays and one for weekends, so Friday was simply Monday. This revision replaces those four columns with a `venue_hours` table holding one row per day of the week, where a day with no times is closed all day. Every place that asked "is this a weekend?" now asks "which day of the week is this?", which is one question with one answer instead of a bucket that never fitted. The seven days are saved as one edit, all or nothing, so a half saved week cannot reach the grid.

**What changed from the shipped version.** **AC-8** and **AC-9** are rewritten below; they previously described four time columns (`weekday_open`, `weekday_close`, `weekend_open`, `weekend_close`) on `venue_settings`, a form with a Weekdays pair and a Weekends pair, and a stranded booking count measured against whichever of the two pairs `isWeekend()` picked. Everything else that shipped on 2026-09-15 stands unchanged.

## Requirements

**User stories**

- As Ella, I want to add a court when we build one and retire a court when it is out of use, so that both boards match the courts we actually have.
- As Ella, I want to rename and reorder the courts, so that the columns read the way we talk about them at the desk.
- As Ella, I want to change the opening hours, the slot length and how far ahead staff may book, without a deploy or a database editor, so that the grid matches how the venue runs this season.
- As Ella, I want to be stopped from retiring a court that still has bookings, and told how many, so that no customer turns up to a court that is gone.
- As Ella, I want to be warned before an hours change strands bookings outside the new hours, so that it is a choice and not a surprise.
- As a staff member or a player with a board open, I want a court or hours change to show up by itself, so that I am never reading a grid with the wrong columns or the wrong hours.
- As Ella, I want each day of the week to carry its own opening and closing time, so that our late Friday is a Friday setting and not a special case somebody has to remember.
- As Ella, I want to mark a day closed with no hours at all, so that the boards say we are shut rather than showing an empty grid people have to interpret.
- As a staff member on shift, I want to still be able to put a booking on a day we are normally closed, so that a tournament or a private hire does not need Ella and a database editor.
- As a player checking from my phone, I want the board to tell me plainly that the venue is closed that day, so that I do not turn up to a locked gate.

**Acceptance criteria** (the contract, each independently checkable)

- **AC-1**: The owner screen lives at `/staff/settings`. It is already inside the `/staff/` matcher in `proxy.ts`, so a signed out visitor is redirected to `/sign-in` and returned there afterwards. The page reads `currentStaff()` on the server: a signed in person whose role is not `owner`, or whose `is_active` is false, is redirected to `/staff` before any settings read happens. The staff menu shows a Settings link (icon only on a phone, like the Schedule link) only when the current staff member is an active owner. The page is marked `noindex`, like `/staff`.
- **AC-2**: The page is three sections, top to bottom: Courts, Opening hours, and Retired courts. Retired courts is a collapsed disclosure and renders only when at least one retired court exists. The page reads through one function, `getOwnerSettings()`, on `staffSupabase()`, returning every court (live and retired, each with its `version`) and the `venue_settings` row with its `version`. While that read streams, `app/staff/settings/loading.tsx` shows a skeleton of the three sections; a failed read shows an error notice whose Retry is a client button calling `router.refresh()`, which runs the server read again.
- **AC-3**: The Courts section lists live courts in `sort_order`, each row showing the name, the note when there is one, an Edit control, Move up and Move down controls, and Retire. An Add court button opens `CourtSheet` with a name (required, 1 to 40 characters after trimming) and a note (optional, up to 200 characters). Submitting calls `saveCourt` with no `id` and no `sortOrder`; the action computes `sort_order` as the highest live order plus one (zero when there are no live courts), so a new court always lands last. On success the sheet closes, the row appears at the end, and a toast confirms.
- **AC-4**: Edit opens the same `CourtSheet` prefilled with the court's name and note and saves through `saveCourt` with the court's `id`, `version` and its current `sortOrder` resent unchanged (the sheet never moves a court; only reorder does). A live court's name is unique, ignoring case and surrounding spaces, enforced by a partial unique index `court_live_name_idx` on `lower(btrim(name)) where retired_at is null`. A clash is returned as a `conflict` with reason `name_taken` and shown on the name field inside the sheet, which stays open with the typed name. When the row changed under the editor (`version_stale`), the sheet reloads the fresh values, says the court changed while you were editing, and saving again writes against the new version.
- **AC-5**: Move up and Move down swap a court with its neighbour. The first row's Move up and the last row's Move down are disabled. A press moves the row at once (optimistic), locks every order control until the write returns, and calls a new Server Action `reorderCourts` with the whole live list in its new order, each entry carrying `id` and `version`. The action calls a new Postgres function `public.reorder_courts(ids bigint[], versions integer[])` that, in one transaction, parks every listed court at a negative order, then writes each court's position as its `sort_order`, bumps its `version` and sets `changed_by`. It raises `stale_version` if any row's version does not match, and raises `insufficient_privilege` when a phase updates fewer rows than were listed (the owner policy made the update touch nothing); `describeDatabaseError` maps those to `version_stale` and `forbidden`. In both cases nothing is written. On success the list keeps its new order; on any failure it reverts, refetches, and shows the message. Every order control has an accessible name that includes the court's name (Move `<name>` up), and a polite live region announces "`<name>` moved to position N of M" after a move.
- **AC-6**: Retire opens `ConfirmDialog` naming the court, with Keep as the safe choice. Confirming calls `retireCourt`. When active bookings end after now on that court, the action refuses with `court_has_bookings` and the count; the dialog shows the action's own message ("That court still has N bookings ahead of it.") and stays open. On success the court leaves the Courts list, appears under Retired courts, and a toast confirms.
- **AC-7**: Each retired court row shows its name and the date it was retired, in `Asia/Manila`, and a Restore control. Restore is one tap, no confirmation, calling `saveCourt` with `restore: true` and the court's current name, note, `sortOrder` and `version`. The spec 0002 rule stands: the court keeps its old order unless another live court now holds it, in which case it takes the next free order.
- **AC-8** (revised 2026-09-22): The Opening hours form is seven day rows, Monday at the top through Sunday, plus slot length and booking horizon. Each day row carries Opens, Closes and a Closed toggle. The time fields stay `Select` controls offering every 30 minutes from `00:00` to `23:30` for opens and from `00:30` to `24:00` for closes, shown in the compact 12 hour style through `formatSlotLabel`, which reads `24:00` as Midnight rather than 12pm. Turning Closed on disables that row's two selects and clears them; turning it off restores the venue's most common open pair as a starting point, so Ella is never picking from a blank. Slot length is a `Select` of 30, 60 and 90 minutes. Booking horizon is a number from 1 to 365. Save is disabled until something differs from what was loaded. Submitting calls `saveVenueSettings` with all seven days, the slot length, the horizon and the `version`. `closeTimeSchema` accepts `HH:mm` up to and including `24:00`; `localTimeSchema` is unchanged, so `24:00` is never a valid open or booking start. Per day, Zod requires that either both times are present with the close after the open, or both are absent, which is what closed means.
- **AC-9** (revised 2026-09-22): Before writing, `saveVenueSettings` counts the active bookings (`kind = 'booking'`, `status = 'active'`, `ends_at > now()`) that fall wholly or partly outside the proposed hours **for that booking's own day of the week**, computed in `venue_settings.timezone` in TypeScript with the helpers in `lib/time.ts`. A booking on a day the proposal marks closed is outside by definition, since a closed day has no hours to be inside. The helpers in `lib/schedule/outside-hours.ts` change signature to match: `isOutsideHours(row, days, timezone)` and `countOutsideHours(rows, days, timezone)` take the seven entry array in place of the old `VenueHours` pairs, look the row's own day up, and return true for a closed day without consulting any time. Neither calls `isWeekend()` any more. When the count is above zero and the input does not carry `acknowledge: true`, the action writes nothing and returns a `conflict` with reason `bookings_outside_hours` and the count. The form shows `ConfirmDialog` reading "N future bookings fall outside these hours. Save anyway?" with Save anyway and Keep editing, which resends the same input with `acknowledge: true`. Bookings beyond a shortened horizon are neither counted nor blocked. Closures are never counted.
- **AC-10**: A close time of `24:00` works end to end. `zonedTimeToUtc` in `lib/time.ts` today refuses anything past `23:59` and `buildGrid` calls it with the close time, so `zonedTimeToUtc(date, "24:00", timezone)` is widened to resolve to the first instant of the next local day. With that, `openingHours` and `buildGrid` in `lib/schedule/grid.ts` produce a last slot that ends at midnight, and a booking or closure ending at midnight stores correctly. `DayNav`, `dayBoundsUtc` and the midnight day roll from spec 0006 are unchanged.
- **AC-11**: A migration adds one `security definer` trigger function, `public.schedule_meta_broadcast()`, with `set search_path = ''`, attached after insert or update on `court` and after update on `venue_settings`. It sends a payload of exactly `op`, `table` and `id` on the existing private `schedule` topic, as event `court_changed` or `settings_changed`. `useScheduleChannel` subscribes to both events beside `reservation_changed` and requests a read, never patching state from the payload. As a result, both boards show a new, renamed, reordered, retired or restored court and a changed set of hours or horizon without a reload.
- **AC-12**: When a board's refetch is refused because the day it is showing is now beyond the horizon, the board replaces its URL with no `date`, reads today, and shows a toast saying the day is no longer open for booking. `TransportResult` in `use-schedule-channel.ts` gains an optional `reason: "out_of_range"` on its failure shape; the public transport sets it from the `422` body of `GET /api/schedule` and the staff transport from the `invalid` result of `refreshStaffSchedule`, so the hook can tell this apart from any other failure and never shows the retry error state for it.
- **AC-13**: Every write from the settings page is conditional on the `version` the page last read and records `changed_by`, through the existing actions. The page holds no live subscription. A `version_stale` result from any write refetches `getOwnerSettings()`, replaces the list and the form's loaded values with the fresh rows, and says in a toast that somebody else changed the settings. A `forbidden` result (a role changed under an open tab) is shown as a toast, never swallowed.
- **AC-14**: The sheets and dialogs follow the spec 0005 viewport rule: from the bottom on a phone, from the right at 768 pixels and wider. Every control is reachable and operable by keyboard, the retired section is a real disclosure button with `aria-expanded`, form errors are tied to their fields, and every new surface meets WCAG 2.2 AA contrast in both themes.
- **AC-15**: Proven live on the real Supabase project with `npx supabase db advisors` clean after the migration: an owner adds a court, renames it, moves it up, sets the weekday close to Midnight, then retires a court that has a future booking and is refused with the count, while a signed out browser on `/` and a signed in staff browser on `/staff` reflect each accepted change with no reload. A non owner staff account opening `/staff/settings` lands on `/staff`.

**Added 2026-09-22, the per day opening hours revision.** These are `Proposed` and not yet built.

- **AC-16**: One forward only migration creates `public.venue_hours`: `day_of_week smallint primary key check (day_of_week between 0 and 6)`, `open_time time null`, `close_time time null`, `changed_by text null references public.staff`, `updated_at timestamptz not null default now()` written by the same trigger `venue_settings` uses. `0` is Sunday, matching both Postgres `extract(dow)` and JavaScript `getUTCDay()`, so no code translates between two numbering schemes. Three checks: `(open_time is null) = (close_time is null)`, so a day cannot half exist; `close_time > open_time`; and `open_time < time '24:00'`, so a day may end at midnight but never start there, the same rule `venue_settings_open_before_midnight_check` already carries. The migration seeds exactly seven rows, backfilling days 1 to 5 from `weekday_open`/`weekday_close` and days 0 and 6 from `weekend_open`/`weekend_close`, then drops those four columns along with `venue_settings_weekday_hours_check`, `venue_settings_weekend_hours_check` and `venue_settings_open_before_midnight_check`. `insert` and `delete` on `venue_hours` are revoked from every role including `authenticated`, so the seven rows are permanently the seven rows and no code can create an eighth or lose Tuesday. `select` is granted to `anon` and `authenticated` (the public board needs the hours); `update` only to `authenticated`, gated by the same `private.is_owner()` policy `venue_settings` uses. `lib/supabase/database.types.ts` is regenerated and `npx supabase db advisors` is clean.
- **AC-17**: A week is one edit. The migration adds `public.save_venue_hours(days jsonb, settings_version integer)`, `security invoker` with `set search_path = ''`, which in one transaction checks `settings_version` against `venue_settings.version`, raising `stale_version` (`errcode = 'P0002'`, already mapped to `version_stale`) if it differs, then updates all seven rows and bumps `venue_settings.version`, setting `changed_by` on every row it touches. It raises `insufficient_privilege` (`42501`, already mapped to `forbidden`) when the update touches fewer than seven rows, which is what a non owner sees, because the policy makes the writes affect nothing and Postgres alone would report success. It refuses with `22023` when `days` does not hold exactly seven entries, one per `day_of_week` 0 to 6. `execute` is granted to `authenticated` and revoked from `anon` and `public`, exactly as `reorder_courts` is. `saveVenueSettings` calls it after its outside hours count and writes the slot length and horizon in the same transaction; a half saved week is therefore impossible.
- **AC-18**: The read path carries seven days. `VenueSettings` and `VenueHours` drop the four weekday and weekend fields and gain `days: { dayOfWeek: number; open: string | null; close: string | null }[]`, seven entries ordered 0 to 6. `openingHours(date, settings)` in `lib/schedule/grid.ts` stops calling `isWeekend()` and looks the date's own day up instead, returning `null` for a closed day. A new pure helper beside it, `weekSpan(days)`, returns the widest pair across the open days with the `06:00` to `22:00` fallback; `buildGrid` takes the closed day span as an explicit argument rather than inferring it, so the two boards and the tests all derive it from the one function. When `openingHours()` returns `null`, `buildGrid` builds its rows from that span instead, marks every hour of the day as outside opening hours (so the hours layer of `stateFor` reads `unavailable` throughout) and leaves the closure and booking layers untouched, which is what AC-20 depends on. When the day is closed and carries no active reservation, `buildGrid` returns no rows. `getSchedule`, `getStaffSchedule` and `getOwnerSettings` each read `venue_hours` alongside `venue_settings`. `isWeekend()` in `lib/time.ts` has no caller left in the hours path and is removed unless the reporting heatmap still wants it.
- **AC-19**: On a closed day the staff board keeps the court columns and shows one line saying the venue is closed that day. That line carries an Add booking button which opens the existing booking sheet with the court, start and end typed in rather than picked from cells. Any active staff member may use it, not owners only. The write path is unchanged and already permits it: neither the Server Action nor Postgres has ever refused a booking for being outside opening hours, so closed is a statement about the schedule, not a lock on the till. The closed line sits **above** the grid, not instead of it: when the closed day already carries at least one active reservation, the grid renders below the line over the closed day span defined in AC-20 so that reservation is visible and openable; when the day carries none, no rows render at all, because there would be nothing in them.
- **AC-20**: On a closed day the public board shows the grid over the **closed day span**, with the ordinary cell rules applying rather than a blanket wash. Cell priority is unchanged from spec 0002 (a closure wins, then a booking, then the opening hours), so an active booking on a closed day still reads as `booked` and every other cell reads as `unavailable`. This is what keeps AC-9's acknowledged save honest: a booking stranded by closing a day stays visible on both boards rather than being painted over. The **closed day span** is a single derived value both boards take from one helper: the earliest `open_time` and the latest `close_time` across the days that are open, falling back to `06:00` and `22:00` when all seven are closed, then widened at both ends to cover any active reservation on that date so no reservation can fall outside the rows. The next free strip finds nothing and says so, and the Now marker behaves as it does on any day the venue is shut.
- **AC-21**: The JSON-LD block on the public board emits one `OpeningHoursSpecification` per distinct pair of times, with every day sharing that pair listed in its `dayOfWeek` array, and omits closed days entirely rather than emitting them with null times. A venue open the same hours all week emits one entry; the Friday case emits two. Within an entry the days are listed Monday first through Sunday, and the entries themselves are ordered by their earliest listed day, so the block is stable between renders and diffs cleanly. Days sharing a pair need not be contiguous.
- **AC-22**: The date picker from spec 0011 renders a closed day visually muted with an accessible name that says the venue is closed, and leaves it selectable, so staff can still open a closed day to review or add what is on it. Nothing about the horizon or the disabled range changes.
- **AC-23**: The usage report computes open minutes per day from that date's own day of the week. A closed day contributes zero open minutes, so it neither inflates nor deflates utilisation, and `hourAxis` takes its span from the widest pair across the seven days, still widened by any hour that has booked minutes. Concretely, in `lib/report/buckets.ts`: `ReportHours` becomes `{ days: { dayOfWeek: number; open: string | null; close: string | null }[] }`; `openPair(date, hours)` returns `null` for a closed day instead of a pair; `openMinutesForDate` returns `0` when it is null; `openDaysForHour` does not count a closed date for any hour; and `hourAxis(hours, rows)` reads its bounds from the open days. None of these call `isWeekend()` any more. The existing caveat on the page stands and is reworded: the report applies today's hours to every past day, because no history of hours changes is kept.
- **AC-24**: The `hours_changed` analytics event's strict schema becomes `days_open`, `days_closed`, `earliest_open`, `latest_close`, `slot_minutes` and `booking_horizon_days`, so a pattern change is visible in PostHog without twenty one properties. `earliest_open` and `latest_close` are nullable and are both null when `days_open` is zero, since a week with no open days has no earliest or latest to report. `venue_hours` gets its **own** broadcast trigger function, `public.venue_hours_broadcast()`, rather than reusing `public.schedule_meta_broadcast()`: that function reads `subject.id`, and `venue_hours` is keyed by `day_of_week` with no `id` column at all, so attaching it would raise "record has no field id" inside `save_venue_hours`'s transaction and abort every single hours save. The new function is otherwise identical (`security definer`, `set search_path = ''`, `execute` revoked from `anon` and `authenticated`) and emits `settings_changed` on the `schedule` topic with `op`, `table` and `id` set to `day_of_week::text`, identity only. The shipped `court` and `venue_settings` triggers are not touched. The seven row updates inside one `save_venue_hours` call fire seven events in one transaction; the hook's existing 300 millisecond coalescing turns that into one read per board, as it already does for a reorder.
- **AC-25**: Proven live on the real Supabase project with `db advisors` clean: an owner sets Friday to close at Midnight while the other weekdays close at 22:00 and marks Monday closed, and a signed out browser on `/` shows Friday's grid running to midnight and Monday's as closed with no reload, while a staff browser on `/staff` shows the same and can still add a booking on the closed Monday through the Add booking button. A non owner calling `save_venue_hours` directly is refused with `forbidden`.

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

**Revision, 2026-09-22: opening hours are per day of the week.** The four time columns on `venue_settings` are replaced by a `venue_hours` table of exactly seven rows, one per day, where a row with no times is closed all day. The week is saved as one transaction guarded by `venue_settings.version`.

Calls made here rather than asked, each with its runner up:

- **No `version` column on `venue_hours`.** The week is one edit guarded by `venue_settings.version`, so a per row version would be a second, weaker lock that could disagree with the first, and the form would have to carry seven of them. `changed_by` is still recorded per row, so the audit trail is unchanged. Runner up: a version per day row, which follows the project rule literally but makes a partial save representable, which is the thing this design is trying to make impossible.
- **`0` is Sunday.** Postgres `extract(dow)` and JavaScript `getUTCDay()` both number Sunday as zero, so storing it that way means no translation layer and no off by one between the migration, the grid and the report. Monday still renders first, which is a display order in one array, not a storage decision. Runner up: ISO numbering with Monday as 1, which reads better in the table but needs a conversion at every boundary.
- **A closed day is a null pair, not a flag.** There is exactly one way to say closed, so no row can claim to be closed while carrying times, and the check `(open_time is null) = (close_time is null)` is the whole enforcement. Runner up: an `is_closed` boolean beside the times, which preserves the hours Ella had before she closed a day but lets two fields disagree.
- **`insert` and `delete` are revoked from everyone on `venue_hours`.** The table is a fixed seven row lookup, not a collection, so the safest thing is to make its cardinality unwritable rather than police it with a trigger or a count check. Runner up: a trigger refusing insert and delete, which is more code for the same guarantee.
- **The public board keeps the grid on a closed day; the staff board does not.** They serve different readers. A player wants the answer at a glance and a wall of grey next to a Closed heading gives it, using the treatment out of hours rows already have. A staff member needs the page to not invite a click on a day that is shut, and needs one deliberate way in when the tournament happens. The asymmetry is chosen, not accidental. Runner up: the same empty state on both, which would cost the public board its familiar shape for no gain to a player.
- **A closed day's grid spans the widest pair across the week**, falling back to `06:00` to `22:00` when every day is closed. A closed day has no hours of its own, and twenty four rows of grey is worse than the venue's usual shape greyed out. Runner up: a fixed `00:00` to `24:00` span, which is simpler but renders a screen of dead rows on a phone.
- **Closed stays advisory at the write level.** Neither the Server Action nor Postgres has ever refused a booking for being outside opening hours, and this revision does not add that. The stranded booking warning already tells Ella when an hours change puts bookings out of hours, which is the same mechanism a newly closed day needs, and staff on shift can handle the exception without her. Runner up: a database check refusing bookings outside hours, which would need an escape hatch for every real exception and would turn a settings change into a booking failure.
- **The seven pairs stay out of the analytics payload.** `days_open`, `days_closed`, `earliest_open` and `latest_close` answer whether the pattern changed and roughly how, which is what the event is for. Runner up: all seven pairs flattened, a twenty two property strict schema on an event that fires a few times a year.

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

**Revision, 2026-09-22: one new table, four columns dropped.**

`public.venue_hours`, exactly seven rows, seeded by the migration and never inserted into or deleted from again:

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `day_of_week` | `smallint` | no | Primary key. `check (day_of_week between 0 and 6)`. `0` is Sunday, matching `extract(dow)` and `getUTCDay()` |
| `open_time` | `time` | yes | Null means closed all day |
| `close_time` | `time` | yes | Null means closed all day. `24:00` is legal here, as it already is for a booking or closure end |
| `changed_by` | `text` | yes | `references public.staff (clerk_user_id)`, like every other table |
| `updated_at` | `timestamptz` | no | `default now()`, written by the same `set_updated_at` trigger `venue_settings` uses |

Checks: `venue_hours_pair_check` `(open_time is null) = (close_time is null)` · `venue_hours_order_check` `close_time > open_time` · `venue_hours_open_before_midnight_check` `open_time < time '24:00'`.

`venue_settings` loses `weekday_open`, `weekday_close`, `weekend_open`, `weekend_close` and the three checks that governed them, and keeps `slot_minutes`, `booking_horizon_days`, `timezone`, `version`, `changed_by` and `updated_at`. It remains the singleton, and its `version` is now the concurrency guard for the week as well as for itself.

`public.save_venue_hours(days jsonb, settings_version integer)`: `returns void`, `language plpgsql`, `security invoker`, `set search_path = ''`. Checks `settings_version` against `venue_settings.version` first and raises `stale_version` (`P0002`) on a mismatch, before anything is written. Refuses with `22023` when `days` is not exactly seven entries covering `day_of_week` 0 to 6. Updates the seven rows from `jsonb_to_recordset`, setting `changed_by = (select auth.jwt() ->> 'sub')`, then bumps `venue_settings.version`. Reads `row_count` through `get diagnostics` after the update and raises `insufficient_privilege` (`42501`) when fewer than seven rows were touched, which is how a non owner is caught; the policy makes the update affect nothing and Postgres alone would report success. `execute` granted to `authenticated`, revoked from `anon` and `public`.

`public.venue_hours_broadcast()`: `returns trigger`, `security definer`, `set search_path = ''`, `execute` revoked from `anon` and `authenticated`. A near copy of `schedule_meta_broadcast()`, separate because that one reads `subject.id` and `venue_hours` has no `id` column; attaching it here would raise "record has no field id" inside `save_venue_hours`'s transaction and abort every hours save. Sends `jsonb_build_object('op', lower(tg_op), 'table', tg_table_name, 'id', subject.day_of_week::text)` as `settings_changed` on the `schedule` topic. Attached as `venue_hours_broadcast_changes`, `after update on public.venue_hours for each row`. The shipped `court` and `venue_settings` triggers are unchanged.

Relationship: `venue_hours` 1:N nothing, `staff` 1:N `venue_hours` through `changed_by`. It is a fixed lookup, joined by nothing, read whole on every schedule read.

**State transitions**

`court`: live → retired (Retire, refused while future bookings exist) → live (Restore, order kept or moved to the next free one). No other states. `venue_settings` has one row and no lifecycle.

A `venue_hours` row has two states and no lifecycle beyond them: **open** (both times set) and **closed** (both times null). Either may become the other through `save_venue_hours`, with no rule about the transition, because a day closing or reopening is an ordinary settings change rather than a workflow.

**API surface**

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
| --- | --- | --- | --- | --- | --- |
| `getOwnerSettings` | server read | none | `courts: CourtRow[]` (live and retired, each with `version`, `retired_at`), `settings: VenueSettingsRow` with `version` | active owner (`staffSupabase()`, policies apply) | `failed` when the settings row is missing |
| `saveCourt` (existing, widened) | Server Action | `id` (opt), `version` (req when `id`), `name` (req), `note` (opt), `sortOrder` (opt on create, req on edit), `restore` (opt) | the saved `CourtRow` | owner (policy) | `409 name_taken`, `409 version_stale`, `409 sort_order_taken`, `403`, `422` |
| `retireCourt` (existing) | Server Action | `id`, `version` | the retired `CourtRow` | owner | `409 court_has_bookings` with `count`, `409 version_stale`, `403`, `404` |
| `reorderCourts` (new) | Server Action | `courts: { id, version }[]` in display order, 1 to 50 entries, ids unique | `ok` with the fresh live court list | owner | `409 version_stale`, `403`, `422` |
| `saveVenueSettings` (existing, revised 2026-09-22) | Server Action | `version`, `days: { dayOfWeek, open, close }[]` (exactly 7, `open` by `localTimeSchema` or null, `close` by `closeTimeSchema` or null, both or neither), `slotMinutes`, `bookingHorizonDays`, `acknowledge` (opt) | the saved settings and the seven day rows | owner | `409 bookings_outside_hours` with `count`, `409 version_stale`, `403`, `422 close not after open`, `422 one time without the other`, `422 not seven days` |
| `GET /staff/settings` | page | none | the page, or a redirect | active owner | redirect to `/sign-in` (proxy) or `/staff` (page) |
| `public.save_venue_hours` (new 2026-09-22) | Postgres function | `days jsonb` (7 entries), `settings_version integer` | void | `authenticated`, owner policy decides every row | `P0002 stale_version`, `42501 insufficient_privilege`, `22023 not seven days` |

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
| `saveVenueSettings` | which hours apply to a booking | revised 2026-09-22: its day of the week from `calendarDateInZone(starts_at, timezone)`, then that day's entry in the proposed `days` array |
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

Added 2026-09-22, the per day revision:

| Action | Value produced or displayed | Source |
| --- | --- | --- |
| every schedule read | the seven days of hours | `venue_hours` rows, times trimmed with `trimSeconds`, ordered by `day_of_week` |
| `openingHours(date, settings)` | which pair applies to a date | the date's own day of the week, from `calendarDateInZone(date, timezone)`, looked up in `days`; `null` when that row's times are null |
| `buildGrid` | how many rows a closed day has | derived: none when the day carries no active reservation; otherwise the closed day span below |
| `weekSpan(days)` in `grid.ts` | the closed day span, for both boards | derived: the earliest `open_time` and the latest `close_time` across the open days, falling back to `06:00` and `22:00` when all seven are closed, then widened to cover any active reservation on that date. One helper, so the two boards and the tests cannot disagree |
| `buildGrid`, closed day | each cell's state | the unchanged spec 0002 priority: a closure, then a booking, then the hours layer, which reads `unavailable` for every hour of a closed day |
| public board, closed day | the next free strip's answer | derived: nothing is free, because no cell is available |
| staff board, closed day | the Add booking button's court, start and end | typed by the staff member in the existing booking sheet, since no cell was clicked to seed them |
| `saveVenueSettings` | whether a booking on a closed day is outside | derived: a closed day has no pair, so every booking on it counts as outside |
| `save_venue_hours` | whether the week on screen is stale | `settings_version` compared to `venue_settings.version`, checked before any write |
| `save_venue_hours` | whether the caller was allowed | `row_count` after the update compared to seven; fewer means the owner policy refused |
| `save_venue_hours` | each row's `changed_by` | `(select auth.jwt() ->> 'sub')`, as every other write does |
| Opening hours form | a reopened day's starting times | derived: the venue's most common open pair across the other six days, so a blank row is never presented |
| JSON-LD block | how days are grouped | derived: days sharing an identical `(open_time, close_time)` pair collapse into one entry; closed days are omitted |
| date picker | whether a date is a closed day | derived: that date's day of the week looked up in `days` |
| usage report | open minutes for a date | derived: that date's own day pair, zero when the day is closed |
| usage report | the hour axis span | derived: the earliest open and the latest close across the seven days, widened by any hour that has booked minutes |
| `hours_changed` event | `days_open`, `days_closed`, `earliest_open`, `latest_close` | derived from the seven saved rows after a successful write; the last two are null when `days_open` is zero |
| `venue_hours_broadcast()` | the event's `id` | `day_of_week::text`, because the table has no `id` column |
| rollback migration | which pair refills the four columns | Monday's into the weekday pair and Saturday's into the weekend pair, falling back to the first open day in that group, then to `06:00` to `22:00` |

**Key invariants**

1. No two live courts share a name, ignoring case and outer spaces (`court_live_name_idx`). Retired courts may share a name with a live one, so a court can be retired and a new one given the same name.
2. `sort_order` is unique among live courts (spec 0002, invariant 5). A reorder is all or nothing: after `reorder_courts` returns, the live courts are numbered `0..n-1` in the submitted order, or nothing changed. A negative `sort_order` exists only inside that transaction; application code validates 0 to 9999 and never writes one.
3. An open time is always before `24:00`, and each close time is after its open time. `24:00` is legal only as a close time and as a closure or booking end.
8. (2026-09-22) `venue_hours` holds exactly seven rows, one per `day_of_week` 0 to 6, for the life of the database. `insert` and `delete` are revoked from every role, so this is enforced by the absence of a grant rather than by a rule anything could forget to apply.
9. (2026-09-22) A day is open with both times set, or closed with both null. There is no third state, and no row can carry one time without the other.
10. (2026-09-22) A week is saved whole or not at all. `save_venue_hours` checks `venue_settings.version` before it writes anything and updates all seven rows in one transaction, so no reader ever sees three days of the new week and four of the old.
11. (2026-09-22) Opening hours shape what the grid offers, never what the database accepts. A booking outside hours, or on a closed day, is legal at every layer; it is surfaced by the stranded booking count, not refused.
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
- (2026-09-22) `venue_hours` mirrors `venue_settings` exactly: `select` to `anon` and `authenticated`, because the public board must render the hours; `update` to `authenticated` only, gated by the same `private.is_owner()` policy; `insert` and `delete` granted to nobody at all. `save_venue_hours` is `security invoker`, so those policies decide every row it touches, and its row count check is what turns a policy's silent no op into a `forbidden` the page can show. Opening hours are not personal data, so nothing here changes the privacy posture of the public board.

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

Added 2026-09-22, the per day revision:

- Happy path: Friday closes at Midnight while the other weekdays close at 22:00; Friday's grid carries the late rows and Thursday's does not, verifies **AC-8**, **AC-18**, **AC-25**.
- Happy path: Monday is marked closed; the public board greys the whole day and the staff board shows the closed line with Add booking, verifies **AC-19**, **AC-20**.
- Migration: after the migration the seven rows hold the old weekday pair on days 1 to 5 and the old weekend pair on days 0 and 6, and the four dropped columns are gone from `database.types.ts`, verifies **AC-16**.
- Failure case: `save_venue_hours` called with a stale `settings_version` writes nothing, leaves all seven rows untouched and raises `stale_version`; the form reloads the fresh week, verifies **AC-17**, **AC-13**.
- Failure case: a day submitted with an open time and no close time is refused by Zod before the action calls Postgres, and by the check constraint if it ever got that far, verifies **AC-8**, **AC-16**.
- Failure case: marking Sunday closed while two future Sunday bookings exist returns `bookings_outside_hours` with 2; saving with `acknowledge` writes, and both bookings still render as Booked on that Sunday on both boards, with every other cell Unavailable, verifies **AC-9**, **AC-19**, **AC-20**.
- Failure case: a save of the seven rows commits rather than raising "record has no field id" from the broadcast trigger, and one `settings_changed` event reaches an open board. This is the first statement to run after the migration, because it fails at runtime rather than at build, verifies **AC-24**.
- Edge case: every day of the week marked closed. `weekSpan` falls back to `06:00` to `22:00`, the report shows zero open minutes without dividing by zero, and `hours_changed` sends null for `earliest_open` and `latest_close`, verifies **AC-20**, **AC-23**, **AC-24**.
- Auth and permission: a non owner staff account calling `save_venue_hours` directly gets `forbidden` from the row count check, and the seven rows are unchanged, verifies **AC-17**.
- Accessibility: every day row's Closed toggle has a name that includes the day, the disabled time selects are announced as disabled rather than silently inert, and the closed day notice on both boards is readable by a screen reader, verifies **AC-19**, **AC-22**.

## Build plan

Tracer Bullet: the first slice runs the whole path once, migration to page to a second browser updating by itself, on the simplest write there is, adding a court. Everything after thickens that path.

1. [x] One migration: `court_live_name_idx`, the widened `court_sort_order_check`, `venue_settings_open_before_midnight_check`, `reorder_courts` with its row count checks and grants, `schedule_meta_broadcast()` and its two triggers. Regenerate `lib/supabase/database.types.ts`, apply with `db push`, check with `db advisors`, and add `name_taken` and `bookings_outside_hours` to `ConflictReason` and `describeDatabaseError`, satisfies **AC-4**, **AC-5**, **AC-8**, **AC-11**.
2. [x] The thin thread: `useScheduleChannel` subscribes to `court_changed` and `settings_changed`; `getOwnerSettings()`; the `/staff/settings` page with the owner redirect, `noindex`, and `loading.tsx`; the Settings link in `StaffMenu`; the Courts section with `CourtSheet` for add, `saveCourt` computing the end position; then proven live: a court added on a phone appears as a column in a second browser on `/` with no reload, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-11**.
3. [x] The rest of the court list: Edit through the same sheet with the name clash on the field and the stale version reload; `reorderCourts` and the optimistic, locked list with its live region; Retire through `ConfirmDialog` with the count kept in the dialog; the Retired courts disclosure with the date and Restore, satisfies **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-13**.
4. [x] Opening hours: `closeTimeSchema`, the `24:00` path through `timeToMinutes`, `openingHours`, `buildGrid`, the widened `zonedTimeToUtc` and the Midnight case in `formatSlotLabel`, with unit tests; the form with its selects, dirty tracking and version; the outside hours count in `saveVenueSettings` as a pure, tested function over rows and the two step save with `ConfirmDialog`, satisfies **AC-8**, **AC-9**, **AC-10**, **AC-13**.
5. [x] Finish: the `reason` field on `TransportResult`, `out_of_range` set by both boards' transports, and the go to today rule in the hook; the viewport rule for sheets and dialogs; keyboard, names and contrast checked in both themes; then the full live proof of AC-15 on the real project, satisfies **AC-12**, **AC-14**, **AC-15**.

### Build plan, the per day revision (2026-09-22)

Tracer Bullet again, and the thread is deliberately the read path first: the narrowest real proof is a Friday row changed by hand in SQL showing up as late rows on both boards with no reload. Once that thread is alive, the form, the closed day surfaces and the report thicken it. Slice 1 is the only one that can break what already ships, so it lands alone.

1. [x] The migration and the read path, end to end. `venue_hours` with its checks, grants and seed backfilled from the four columns, the four columns dropped, `venue_hours_broadcast()` and its trigger (its own function, not the shared one, see AC-24), `database.types.ts` regenerated, `db push` and `db advisors` clean. Then `VenueSettings`/`VenueHours` carry `days`, `openingHours()` looks up the day instead of calling `isWeekend()`, `weekSpan(days)` lands beside it with unit tests, and `getSchedule`, `getStaffSchedule` and `getOwnerSettings` read the table. Proven live: `update venue_hours set close_time = '24:00' where day_of_week = 5` and both open boards show Friday's late rows without a reload, which is also the proof the broadcast function does not raise on a table with no `id`, satisfies **AC-16**, **AC-18**, **AC-24**.
2. [x] The write path. `save_venue_hours` with its version check, its seven row update, its row count check and its grants; the revised `saveVenueSettings` Zod schema over the seven day array; the revised outside hours count treating a closed day as wholly outside, as a pure tested function over rows; the seven row form with its Closed toggles, dirty tracking and the two step save dialog, satisfies **AC-8**, **AC-9**, **AC-17**.
3. [x] The closed day, everywhere it shows. `buildGrid` over the closed day span with the unchanged cell priority, returning no rows only when the day carries no reservation; the staff board's closed line with its Add booking button into the existing sheet, sitting above the grid; the public board's greyed grid with any existing booking still reading as Booked; the date picker's muted closed days with their accessible names; the JSON-LD grouping that collapses equal days, omits closed ones and orders Monday first, satisfies **AC-19**, **AC-20**, **AC-21**, **AC-22**.
4. [x] Finish. The usage report's per day open minutes, its zero for closed days and its widened hour axis, with the caveat line reworded; the `hours_changed` payload as a shape summary; the keyboard, name and contrast pass over the seven day form and both closed day states; then the full live proof of AC-25 on the real project, satisfies **AC-23**, **AC-24**, **AC-25**.

## Migration plan

**Strategy**: big bang, in one migration and one deploy. Not a strangler, and that is a deliberate exception to the usual instinct.

The strangler pattern earns its keep when the old and new can serve traffic side by side while confidence is built. Here they cannot meaningfully: the four columns and the seven rows would have to be kept in sync by a trigger for the whole overlap, and any read still on the old columns would be silently correct for six days a week and wrong on Friday, which is precisely the bug being fixed. The venue is one site with a handful of staff, the whole application is one deployment, and `openingHours()` has exactly three callers. The honest cheaper path is one migration with the old columns dropped in it, so no read can survive on stale data.

**Phases**:

1. Migration and code in one deploy. The migration creates `venue_hours`, seeds and backfills the seven rows from the four columns inside the same transaction, then drops those columns. The deploy carries the read path, so no build ever runs against a schema it does not match.
2. The write path, the closed day surfaces and the report follow in later deploys. Each is additive and none touches the schema again.

**Rollback**: reverting phase 1 needs a forward migration that re-adds the four columns and fills them from `venue_hours`, plus a revert of the deploy. That is lossy by definition: a week with three distinct patterns cannot be squeezed back into two pairs. The rule, so nobody has to invent one under pressure, is **Monday's pair into `weekday_open`/`weekday_close` and Saturday's into `weekend_open`/`weekend_close`**, with a closed Monday or Saturday falling back to the first open day in its group and to `06:00` to `22:00` if that group is entirely closed. Every other day's difference is lost, which is the point of writing the rule down rather than discovering it mid incident. Take a `pg_dump` of `venue_settings` and `venue_hours` before applying, and treat rollback as a real but unpleasant option rather than a free one.

**Risks**:

- The four dropped columns have nine code references today, spread across the grid, the stranded booking count, the report buckets, the report query, the JSON-LD block, the analytics schema, the settings form and the generated types. Missing one is a TypeScript error rather than a runtime surprise, because `database.types.ts` is regenerated in the same step; `npm run check` is the gate.
- `anon` holds a `select` grant on the four columns today. Dropping them is what removes that reach; a `venue_hours` created without its own `select` grant to `anon` would leave the public board with no hours and an empty grid. Slice 1's live proof on a signed out browser is what catches that.
- The seeded backfill runs once. If it is wrong, it is wrong silently: the boards render plausible hours that are not the venue's. Read the seven rows back and compare them to the old four values as the last statement of the migration's verification, before touching any code.

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

### Consequences of the per day revision (2026-09-22)

**Positive**

- Friday night is a Friday setting. The venue's real pattern is expressible without anybody remembering a special case, and the next request of this shape (Sunday opens late, Monday is shut) costs a form entry rather than a spec.
- The weekday and weekend bucket disappears from the codebase. Three separate places asked `isWeekend()` and got a bucket the venue never actually ran on; they now ask which day it is and get an answer.
- A closed day is finally sayable. Today a shut Monday is expressed as a full day closure reservation on every court, which is a workaround that the usage report counts as open time.
- The report's utilisation gets more honest: a closed day contributes zero open minutes rather than a full day of hours nobody could book.

**Negative and tradeoffs**

- The form is seven rows where it was two, which is more picking for a venue whose weekdays genuinely all match. No bulk fill is built, so setting a uniform week means five identical choices. If that grates, a copy helper goes on top of the same shape.
- Every schedule read gains a second query, since `venue_hours` is read alongside `venue_settings`. Seven rows on a page that already makes several round trips is noise, but it is a second round trip that did not exist.
- The migration drops four columns in one go. There is no overlap period, so a rollback is a lossy forward migration rather than a revert, and the risk sits entirely in slice 1.
- `venue_settings.version` now guards two tables. That is what makes the week atomic, and it also means an unrelated slot length change bumps the version that a concurrent hours edit is checking, so two owners on the settings page collide slightly more often than before. On a page opened a minute a month that is the right trade.
- Seven row updates fire seven broadcast events per save. The hook's coalescing absorbs it, as it already does for a reorder, but the channel is noisier for a moment.
- The two boards differ on a closed day: the staff board leads with a Closed line and an Add booking button and hides the rows when there is nothing in them, while the public board always renders the greyed grid. That is a deliberate split by audience, and it is still one more inconsistency a future reader has to understand rather than assume is a bug.
- A closed day's grid span is a derived value with three inputs (the open days, the fallback, the reservations on that date), so it is the most likely thing in this revision to be subtly wrong. It lives in one tested helper for exactly that reason, but "how tall is a closed day" is now a question the code has to answer rather than one that could not be asked.

**Neutral**

- `isWeekend()` in `lib/time.ts` loses its callers in the hours path. Whether it stays for the reporting heatmap is a build time call, not a spec one.
- The `hours_changed` event's properties change shape, so any PostHog insight built on `weekday_open` and friends stops populating. Nothing is built on them yet.
- One off date exceptions (a holiday, a typhoon) are still handled the way they are today, with a closure reservation across the courts. The `venue_hours` table leaves room for a date keyed override table beside it if that stops being enough.
- Hours history is still not kept, so the report continues to apply today's hours to every past day. The revision makes that caveat slightly more visible, because a day marked closed today reads as closed for the whole range.

## Follow-up

- [ ] `supabase/AGENTS.md` says court changes broadcast through `realtime.broadcast_changes()`. Since spec 0002 the real pattern is a narrowed `realtime.send()` on the `schedule` topic, and this spec adds a second trigger in that style. Worth fixing that line with `/sync` once this ships.
- [ ] The Deferred item "Closing at midnight" and the spec 0005 follow up about `24:00` are resolved here; drop them from the scope when this feature closes.
- [ ] Drag reorder on a desktop is deliberately not built. If Ella asks, it goes on top of `reorderCourts` with a keyboard fallback, and needs a decision on the library.
- [ ] A venue with many more bookings than this one would want the outside hours count as a SQL function. Not now.
- [ ] The staff management screen (roles, switching a leaver off) stays in Deferred; `/staff/settings` is the natural home for it when it is specced.

Added 2026-09-22:

- [ ] Specs 0002, 0006, 0008 and 0009 each describe the weekday and weekend pair in their own text. They go stale the moment this revision ships. Reconcile them with `/sync` rather than editing them by hand now.
- [ ] The Deferred item "Opening hours history" becomes more valuable with this change, because a day can now be closed and the report will claim it was closed for the whole range. Still deferred, and the caveat on the page still covers it.
- [ ] One off date exceptions (a public holiday, a tournament on a closed day) are deliberately out of scope. A `venue_hours_override` table keyed by calendar date sits naturally beside `venue_hours` if closures on the courts stop being enough. Add it to the scope's Deferred list.
- [ ] No bulk fill on the seven day form ("copy Monday to all weekdays"). Worth revisiting after Ella has used it a few times, not before.
- [ ] `lib/time.ts`'s `isWeekend()` may end up with no callers. Remove it in slice 4 if the report does not keep it, rather than leaving a helper that describes a model the project no longer uses.
