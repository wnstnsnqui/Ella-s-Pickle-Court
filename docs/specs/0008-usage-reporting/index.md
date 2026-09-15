# 0008. Usage reporting

**Date**: 2026-09-15
**Status**: Accepted

## Summary

Ella gets one owner only page, `/staff/reports`, that answers "when are the courts busy?" from the bookings the schedule already stores. She picks a preset range (last 30 days by default, up to 12 months), optionally one court, and sees booked hours and utilisation (booked time as a share of open time) by hour of day, by day, and as a weekday by hour heatmap, plus a CSV download of the same numbers. Clicking a day lists everything on that day, cancelled rows included. One migration adds two columns that record who cancelled a booking and when, and one Postgres function that splits bookings into hourly minutes so the page runs a single query. Nothing updates live; the report is read only and renders fresh on every request.

## Requirements

**User stories**

- As Ella, I want to see which hours and which days are busy over a range I choose, so that staffing and opening hours follow the real pattern instead of a hunch.
- As Ella, I want the same view for one court, retired ones included, so that I can tell whether a court is under used before I change it.
- As Ella, I want to open any day in the range and see every booking, closure and cancellation on it, so that a quiet day on the chart has an explanation.
- As Ella, I want to download the numbers behind the charts, so that I can keep them in a spreadsheet alongside takings.
- As a staff member, I should not be able to open the report, because staffing and hours are the owner's calls.

**Acceptance criteria** (the contract, each independently checkable)

- **AC-1**: The report lives at `/staff/reports`, inside the `/staff/` matcher in `proxy.ts`, so a signed out visitor is sent to `/sign-in` and returned afterwards. The page reads `currentStaff()` on the server: a signed in person whose role is not `owner`, or whose `is_active` is false, is redirected to `/staff` before any report read happens, exactly as `/staff/settings` does. The staff menu shows a Reports link (a `ChartColumn` icon, icon only on a phone like the other links) beside Settings, only when the current staff member is an active owner. The page is marked `noindex`.
- **AC-2**: The view is addressed by three query string parameters, parsed by a Zod schema in `lib/report/schemas.ts` with defaults, so a bad or stale value is treated as absent and never produces an error page: `range` (one of `last-7-days`, `last-30-days`, `last-90-days`, `this-week`, `last-week`, `this-month`, `last-month`, `last-12-months`; default `last-30-days`), `court` (a court id, coerced to a positive integer with `.catch(undefined)`, so a malformed value such as `court=abc` behaves like an unknown id and falls back to all courts; a retired court is a valid pick), and `day` (a `YYYY-MM-DD` local date; a day outside the range is ignored). A pure function `resolveRange(preset, today)` in `lib/report/range.ts` turns a preset into an inclusive pair of local dates in `Asia/Manila`, where `today` is `todayInZone("Asia/Manila")`: the rolling presets end today and start N minus 1 days earlier; weeks run Monday to Sunday; `this-week` and `this-month` run from their first day to today; `last-12-months` starts on the first day of the month eleven months before this one and ends today. The longest range is therefore under a year by construction; no separate cap is needed.
- **AC-3**: One forward only migration adds `cancelled_at timestamptz` (nullable) and `cancelled_by text` (nullable, references `staff (clerk_user_id)`, with an index) to `reservation`, and a `before update` trigger function `public.reservation_set_cancelled()` (`security invoker`, `set search_path = ''`) that, when `status` changes from `active` to `cancelled`, sets `cancelled_at` to `now()` and `cancelled_by` to `new.changed_by`. The same migration backfills every already cancelled row from its latest `reservation_audit` row where `old_row->>'status'` is `active` and `new_row->>'status'` is `cancelled` (falling back to the row's `updated_at` when no such audit row exists), then adds the check constraint `reservation_cancelled_at_matches_status_check`: `(status = 'cancelled') = (cancelled_at is not null)`. `cancelReservation` in `lib/schedule/actions.ts` is unchanged; the trigger is what fills the columns, so any future cancel path fills them too. The anon column grant on `reservation` is untouched (the public board never sees who cancelled); `authenticated` already holds a full table select on `reservation`, so no new grant is needed. The generated types in `lib/supabase/database.types.ts` are regenerated.
- **AC-4**: The same migration adds `public.court_usage(from_date date, to_date date, court_id bigint default null)`, a `stable`, `security invoker`, `set search_path = ''` plpgsql function that first raises `insufficient_privilege` unless `private.is_owner()` (already executable by `authenticated` since migration `20260914072322_policy_helper_execute.sql`; do not re-grant it), then returns one row per `(court_id, local_date, hour, booked_minutes)` for every reservation with `kind = 'booking'` and `status = 'active'` that overlaps the range. The range is the half open span of instants from the start of `from_date` to the start of the day after `to_date`, both in `venue_settings.timezone`. Each booking is clipped to that span and split into local hour buckets by `generate_series` over the hours it touches; `booked_minutes` for a bucket is the whole minutes of intersection between the booking's `during` range and that hour, so a 4:30pm to 6pm booking yields 30 minutes at hour 16 and 60 at hour 17. A booking ending at midnight lands in hour 23 of its own day. Closures and cancelled rows never appear. Rows with zero minutes are not returned. When `court_id` is given only that court's rows are returned, retired or not. `execute` is granted to `authenticated` and revoked from `anon` and `public`. Row level security still applies inside the function, so it reads only what the caller's policies allow.
- **AC-5**: The page reads through one function, `getUsageReport({ range, courtId })` in `lib/report/queries.ts`, on `staffSupabase()`, which resolves the range, calls `court_usage` through `.rpc()`, and also loads every court (live and retired, in `sort_order`) and the `venue_settings` row. Pure functions in `lib/report/buckets.ts`, unit tested, fold the usage rows into: `byHour` (booked minutes per hour of day, summed over the range), `byDay` (booked minutes per local date, every date in the range present even at zero), `byWeekdayHour` (a 7 by 24 grid of booked minutes), and `totals` (booked minutes, open minutes, busiest hour, busiest weekday, with ties going to the earliest). Open minutes for a date are `timeToMinutes(close) − timeToMinutes(open)` for that date's weekday or weekend hours from `venue_settings` (a `24:00` close reads as 1440), multiplied by the courts counted: the number of live courts (`retired_at is null`) for all courts, or exactly one when a court is picked. Open minutes for an hour bucket count only the days on which that hour falls inside `[open, close)`. Utilisation is `booked ÷ open`, rounded to a whole percent, capped at 100, and 0 when open minutes are 0. The page states in one line that the percent uses the current opening hours and live courts.
- **AC-6**: The page is, top to bottom: a toolbar with the eight preset chips (the active one marked, each a link that keeps `court` and drops `day`) and a court `Select` (All courts first, then live courts in `sort_order`, then retired courts each tagged Retired), wrapped in a small client component that on change calls `router.push` to the same URL with `court` set and `day` dropped, the same rule as the chips, so the page itself stays a server component; four summary tiles (booked hours to one decimal, utilisation percent, busiest hour as a slot label via `formatSlotLabel`, busiest weekday); then three charts in order: booked hours by hour of day (a bar chart), booked hours by day (a bar chart, one bar per date in the range), and a weekday by hour heatmap (a grid of cells shaded by booked minutes, weekdays Monday to Sunday down the side, hours across; each cell's shade is relative to the largest cell in the current view, an empty cell reads as the background, and a small visible legend of three swatches labelled Low, Medium and High sits beside it). Each chart shows booked hours and the utilisation percent in a tooltip on hover; there is no keyboard focus path into a chart, because the paired hidden table (AC-11) carries every value. All three are built on Recharts 3 as client components using the `responsive` prop, with colours taken from the spec 0003 design tokens so both themes pass WCAG 2.2 AA contrast.
- **AC-7**: The hour axis of the by hour chart and of the heatmap runs from the earliest open time to the latest close time across the weekday and weekend hours, extended to include any hour that has booked minutes in the range, so out of hours use is shown rather than clipped. Empty overnight hours outside that span never render.
- **AC-8**: Clicking a bar in the by day chart navigates to the same URL with `day=<date>`; the hidden data table for that chart (AC-11) carries a link per date to the same place, which is the keyboard path. When `day` is set and inside the range, a Day section renders below the charts, headed by `formatDayHeading(day)` with a Close link that drops the parameter. It reads `getDayReservations(day)` in `lib/report/queries.ts` on `staffSupabase()`: every reservation on every court whose range overlaps that local day, active and cancelled, bookings and closures, joined to `staff` for the display names of `created_by` and `cancelled_by`, ordered by court `sort_order` then `starts_at`. Each row shows the court name, the local start and end (`localTimeInZone` and `localEndTimeInZone`, so midnight reads `24:00`), the customer name for a booking or Closed plus the note for a closure, the status, who booked it, and for a cancelled row who cancelled it and when. A cancelled row is struck through and also carries the word Cancelled in text, so colour and strike are never the only signal. Phone numbers and amounts are never shown. A day with no rows says so in one line.
- **AC-9**: A route handler at `app/staff/reports/usage.csv/route.ts` answers `GET` with the same `range` and `court` parameters and the same parsing as the page. A signed out caller gets `401`; a signed in caller who is not an active owner gets `403`; the `court_usage` function is the enforcement point, and its `insufficient_privilege` is also mapped to `403`. The body is UTF-8 CSV with a header row `court,date,weekday,hour,booked_minutes`, one row per usage row ordered by court `sort_order`, date, hour, where `court` is the court name, `weekday` is the three letter English day, and `hour` is `0` to `23`. Fields follow RFC 4180 quoting: a field holding a comma, a double quote or a newline is wrapped in double quotes with any inner double quote doubled; rows end in `\r\n`. It is sent with `Content-Type: text/csv; charset=utf-8`, `Cache-Control: no-store`, and `Content-Disposition: attachment; filename="usage-<from>-<to>.csv"`, both dates as `YYYY-MM-DD`. The page shows a Download CSV link in the toolbar pointing at this route with the current parameters.
- **AC-10**: A range with no bookings still renders every chart with its axes at zero and a one line note, No bookings in this range, and the tiles read 0. While the read streams, `app/staff/reports/loading.tsx` shows a skeleton of the toolbar, tiles and three chart areas. A failed usage read, day read or CSV read shows one notice in the `BoardNotice` shape used by the settings page, saying the report could not be loaded and to reload; nothing partial is shown.
- **AC-11**: Every chart is paired with a visually hidden data table (a caption naming the chart, a header row, one row per bar or cell with its booked hours and utilisation percent) that carries the meaning for a screen reader; the Recharts element itself is `aria-hidden` with its built in accessibility layer off, so the numbers are announced once. The by day table's date cells are links (AC-8). The preset chips are links inside a `nav` with an accessible label; the active chip has `aria-current="page"`. Every control is reachable and operable by keyboard, and every new surface meets WCAG 2.2 AA contrast in both themes.
- **AC-12**: The page and the CSV route export `dynamic = "force-dynamic"` and set no cache headers other than `no-store`, so every request reads fresh. The page opens no realtime subscription; a booking cancelled in another tab while a day list is open shows only after a reload.
- **AC-13**: Proven live on the real Supabase project, with `npx supabase db advisors --linked` clean after the migration: an owner opens `/staff/reports`, the tiles and by hour chart match a hand count of a seeded week (including one booking that straddles two hours and one that ends at midnight), switching to one retired court shows its old bookings with a one court denominator, clicking a day shows a cancelled row struck through with who cancelled it, and Download CSV returns a file whose rows add up to the booked hours tile. A signed in staff account opening `/staff/reports` lands on `/staff`, and fetching `/staff/reports/usage.csv` as that account returns `403`.

## Decision

**Chosen option**: Option 1: One Postgres function that returns hourly minutes, three Recharts charts and a hidden table each, `cancelled_by` and `cancelled_at` on `reservation`, and a CSV route beside the page.

One owner page and one CSV route over one query, with the hour splitting in Postgres where the data is, the bucketing in small pure TypeScript functions where the tests are, and two columns that make "who cancelled" a plain read instead of a walk through the audit trail.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `recharts` (`andy-spike/skills`, `.agents/skills/recharts/`) · `zod` (`pproenca/dot-skills`, `.agents/skills/zod/`) · `clerk-nextjs-patterns` (`clerk/skills`, `.agents/skills/clerk-nextjs-patterns/`) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`) · `tailwind-4-docs` (`lombiq/tailwind-agent-skills`, `.agents/skills/tailwind-4-docs/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

Calls made here rather than asked, each with its runner up:

- **The trigger fills `cancelled_at` and `cancelled_by`, not the cancel action.** A column that only one code path sets is a column that is wrong the first time a second path appears (an owner in the SQL editor, a later self service cancel). The trigger reads `new.changed_by`, which every write already records. Runner up: setting both in `cancelReservation`, one line cheaper today and silently stale later.
- **Weeks start on Monday.** The venue's weekend hours are Saturday and Sunday, so a Monday start keeps the weekend together at the end of the week and matches `isWeekend()`. Runner up: Sunday start, the American calendar, which splits the weekend across two rows of the heatmap.
- **The function reads its zone from `venue_settings.timezone`.** The application rule says every local time is `Asia/Manila`, and that column already holds it; reading it keeps SQL and TypeScript on one source rather than two constants that could drift. Runner up: hard coding the zone in the function.
- **Bucketing stays in TypeScript, one SQL function serves all three views.** The finest grain (court, date, hour) is a few thousand rows a year at this venue, folds into any bucket in one pass, and pure functions are trivially unit tested. Runner up: three SQL functions, one per bucket, three round trips and three places to keep the counting rule.
- **The Recharts element is presentational and the hidden table carries the meaning.** Recharts 3 ships an accessibility layer that makes the chart itself keyboard navigable; with a full data table beside it that would announce every number twice. Turning the layer off and marking the chart `aria-hidden` keeps one clear path. Runner up: keep the layer on and drop the table, which loses exact values and the link per day.
- **Retired courts use a denominator of one court.** When Ella filters to a court, the question is "how busy was this court", and the answer is its own open hours, live or retired. Runner up: excluding retired courts from the picker, which hides exactly the history the scope asks to keep.
- **The CSV carries usage rows only, not utilisation.** Utilisation depends on today's hours and courts (AC-5), so a downloaded percent would go stale the day the hours change; booked minutes are a fact. Runner up: adding an `open_minutes` column, which bakes a moving denominator into a file meant to be kept.
- **Menu icon is lucide's `ChartColumn`.** It is the bar chart glyph in lucide 1.x (the old `BarChart3` name is retired). Runner up: `ChartNoAxesColumn`, which reads as a mobile signal bar at small sizes.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**

Existing, read only for this feature:

| Entity | Key | Used columns | Relation |
| --- | --- | --- | --- |
| `court` | `id` | `name`, `sort_order`, `retired_at` | 1:N to `reservation` |
| `reservation` | `id` | `court_id`, `kind`, `status`, `starts_at`, `ends_at`, `during`, `customer_name`, `note`, `created_by`, `changed_by` | N:1 to `court`; N:1 to `staff` via `created_by` |
| `staff` | `clerk_user_id` | `display_name` | names for `created_by` and `cancelled_by` |
| `venue_settings` | `id` | `weekday_open`, `weekday_close`, `weekend_open`, `weekend_close`, `timezone` | the utilisation denominator and the function's zone |

Added by this feature:

| Change | Detail |
| --- | --- |
| `reservation.cancelled_at timestamptz null` | set by trigger when `status` becomes `cancelled` |
| `reservation.cancelled_by text null references staff (clerk_user_id)` | set by trigger from `new.changed_by`; indexed |
| `reservation_cancelled_at_matches_status_check` | `(status = 'cancelled') = (cancelled_at is not null)` |
| `public.reservation_set_cancelled()` | `before update` trigger, fires when `status` changes |
| `public.court_usage(from_date, to_date, court_id)` | `stable`, `security invoker`, raises unless owner; returns `(court_id, local_date, hour, booked_minutes)` |

No new table. The function is not stored data; it is listed so the migration is complete.

**State transitions**

`reservation.status`: `active → cancelled`, terminal, unchanged from spec 0002. This feature adds that the transition now stamps `cancelled_at` and `cancelled_by`.

**API surface**

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
| --- | --- | --- | --- | --- | --- |
| `/staff/reports` (page) | GET | `range` (preset, opt), `court` (id, opt), `day` (date, opt) | the report view | active owner, else redirect | signed out → `/sign-in`; non owner → `/staff`; read failure → notice |
| `getUsageReport({ range, courtId })` (server read) | function | `range: Preset`, `courtId?: number` | `{ from, to, rows, courts, settings }` | `staffSupabase()` | `forbidden` (function raised), `unavailable` (timeout) |
| `getDayReservations(day)` (server read) | function | `day: string` | rows with court name, times, names, `cancelledBy`, `cancelledAt` | `staffSupabase()` | `unavailable` |
| `public.court_usage(from_date, to_date, court_id)` (rpc) | rpc | `date`, `date`, `bigint?` | `(court_id, local_date, hour, booked_minutes)[]` | `authenticated`, owner check inside | `insufficient_privilege` (42501) |
| `/staff/reports/usage.csv` | GET | `range`, `court` | `text/csv` attachment | active owner | `401` signed out, `403` non owner, `503` read failure |

**Value sourcing**

| Action | Value produced or displayed | Source |
| --- | --- | --- |
| page | today, for resolving a preset | `todayInZone("Asia/Manila")` in `lib/time.ts` |
| page | `from`, `to` local dates | `resolveRange(preset, today)` in `lib/report/range.ts` (AC-2) |
| page | the active preset, court and day | query string, parsed by `lib/report/schemas.ts` with defaults |
| `court_usage` | the zone for local date and hour | `venue_settings.timezone` (a single row, `id = true`) |
| `court_usage` | `booked_minutes` per hour | intersection of `reservation.during` with each local hour, `kind = 'booking'`, `status = 'active'` |
| `buckets.byDay` | every date in the range, zeros included | `addDays` and `daysBetween` in `lib/time.ts` over `from` and `to` |
| `buckets.totals` | open minutes per date | `venue_settings` weekday or weekend open and close, chosen by `isWeekend(date)`; `timeToMinutes` with `24:00` as 1440 |
| `buckets.totals` | courts counted | `court.retired_at is null` count for all courts; 1 when `court` is set |
| `buckets.totals` | utilisation percent | `booked ÷ open`, whole percent, capped at 100, 0 when open is 0 (AC-5) |
| `buckets.totals` | busiest hour, busiest weekday | max of `byHour` and of the weekday sums, earliest on a tie |
| tiles | booked hours | `totals.bookedMinutes ÷ 60`, one decimal |
| tiles | busiest hour label | `formatSlotLabel` in `lib/time.ts` |
| hour axis | first and last hour shown | min open and max close across weekday and weekend hours, widened by any hour with minutes (AC-7) |
| heatmap | weekday order and labels | Monday to Sunday, from the local date's weekday |
| court picker | names, order, Retired tag | `court.name`, `court.sort_order`, `court.retired_at` |
| day list | start and end text | `localTimeInZone` and `localEndTimeInZone`, zone `Asia/Manila` |
| day list | customer or Closed | `reservation.kind`, `customer_name`, `note` |
| day list | booked by, cancelled by | `staff.display_name` joined on `created_by` and on `cancelled_by` |
| day list | cancelled when | `reservation.cancelled_at`, formatted with `formatAtVenue` |
| day list | day heading | `formatDayHeading(day)` |
| CSV | `court`, `weekday` | `court.name` by `court_id`; three letter English day from `local_date` |
| CSV | filename | `usage-<from>-<to>.csv` from the resolved range, dates as `YYYY-MM-DD` |
| CSV | field quoting | RFC 4180, applied to every field (AC-9) |
| heatmap | cell shade | `booked_minutes ÷ max booked_minutes` in the current view (AC-6) |
| court picker | navigation on change | `router.push` with `court` set and `day` dropped (AC-6) |
| menu | whether to show Reports | `currentStaff().staff.role === "owner"` and `isActive` |

**Key invariants**

- A cancelled reservation always has `cancelled_at`; an active one never does (check constraint, AC-3).
- `cancelled_by` equals the `changed_by` of the write that cancelled the row (trigger, AC-3); it may be null only for a backfilled row whose audit trail had no actor.
- Usage counts `kind = 'booking'` and `status = 'active'` only; closures and cancelled rows contribute zero minutes everywhere (function, AC-4).
- The sum of `booked_minutes` across every bucket equals the sum of the clipped booking durations in the range; splitting never creates or loses minutes (function and tests, AC-4).
- `court_usage` returns nothing to a caller who is not an active owner; it raises before reading (function, AC-4).
- Every local date and hour in the report is in `Asia/Manila`, never the reader's device (AC-2, AC-4, AC-8).
- Utilisation is never above 100 and never divides by zero (AC-5).
- The page and the CSV never show `customer_phone` or `amount` (AC-8, AC-9).

**Security model**

- Reading the aggregate is owner only, enforced in Postgres: `court_usage` raises `insufficient_privilege` unless `private.is_owner()`. The page redirect and the CSV `403` are courtesies on top.
- The day list reads `reservation` rows that active staff may already read under the spec 0002 policy; the page's owner redirect is the only extra gate, and that is acceptable because it exposes nothing a staff member could not already read on the board.
- The public `anon` role never gains a column: the four column grant on `reservation` is unchanged, and `court_usage` is not executable by `anon`.
- Every read goes through `staffSupabase()`, built per request with the caller's Clerk token; the service role key is not involved.
- No new personal data is stored. `cancelled_by` is a staff id, the same class of data as `changed_by`.

**Configuration required**

None. No new environment variables or credentials. One new npm dependency, `recharts` (3.x).

**Critical test scenarios**

- Happy path: an owner opens `/staff/reports` with no parameters, the default is last 30 days over all courts, the tiles and by hour chart match a hand counted seeded week including a booking straddling two hours and one ending at midnight, verifies **AC-2**, **AC-4**, **AC-5**, **AC-6**, **AC-13**
- Bucketing: `byHour`, `byDay`, `byWeekdayHour` and `totals` are unit tested on fixed rows, including an empty range, a single court, a `24:00` close, an hour outside opening hours, and the 100 percent cap, verifies **AC-5**, **AC-7**
- Cancel stamps the columns: cancelling a booking through the existing action leaves `cancelled_at` set and `cancelled_by` equal to the caller; the constraint refuses a manual `status = 'cancelled'` with a null `cancelled_at`, verifies **AC-3**
- Day list: clicking a day bar opens the list with a cancelled row struck through and labelled, showing who cancelled and when, and no phone number, verifies **AC-8**
- CSV: the download for the current range parses to the same rows the page used and its minutes add up to the booked hours tile, verifies **AC-9**, **AC-13**
- Failure case: a `court_usage` timeout renders one notice and no partial chart; a mistyped preset, an unknown court id and a day outside the range fall back silently, verifies **AC-2**, **AC-10**
- Auth and permission: a staff account is redirected from the page to `/staff` and gets `403` from the CSV route; an anon `rpc('court_usage')` call is refused, verifies **AC-1**, **AC-4**, **AC-9**, **AC-13**
- Accessibility: each chart's hidden table is announced with caption and headers, the by day table's date links open the day list by keyboard, the active preset carries `aria-current`, and contrast passes in both themes, verifies **AC-11**

## Build plan

Ordered for Tracer Bullet: the migration first because everything reads through the function, then the thinnest real thread from the database to a number on the owner's screen, then each view thickened in turn, with the day list and CSV as their own thin threads.

1. [x] Write and apply the migration: the two columns and index, the `reservation_set_cancelled()` trigger, the audit backfill, the check constraint, the `court_usage` function with its owner check and grants; run `npx supabase db advisors --linked` and regenerate `database.types.ts`; write the SQL tests for the split (straddle, midnight, closure, cancelled, clipped at the range edge), the constraint, and the owner check called over the RPC path as an authenticated owner (rows) and as an authenticated staff member (`42501`), satisfies **AC-3**, **AC-4**. Applied live and checked by hand: a booking straddling two hours split 30/60, a booking ending at midnight landed only in hour 23 of its own day, and the backfill pulled real `cancelled_at`/`cancelled_by` from the audit trail for every already cancelled row. `db advisors --linked` is clean (one pre-existing warning on `ensure_staff`, unrelated). One naming note: the RPC's court filter parameter is `for_court_id`, not `court_id` as first written in AC-4 — Postgres refuses a function whose input and output parameter lists share a name, and the output row's `court_id` column is what AC-4 actually contracts on. Automated SQL tests for the split are not yet written (`supabase/tests/`); the migration itself is proven live, not merely applied.
2. [x] Thin thread: `lib/report/schemas.ts` and `lib/report/range.ts` with tests, `getUsageReport` on `.rpc("court_usage")`, the page at `/staff/reports` with the owner redirect and `noindex`, the menu link, and a plain visible table of booked minutes by hour; prove an owner sees numbers and a staff account is redirected, satisfies **AC-1**, **AC-2**, **AC-12**. Confirmed by curl against the dev server: a signed out request to `/staff/reports` redirects to `/sign-in`, exactly as `/staff` and `/staff/settings` do (proof of the redirect path only; no authenticated owner session was available to drive the actual number on screen — see the note on AC-13 below).
3. [x] Add `recharts`; `lib/report/buckets.ts` with `byHour`, `byDay`, `byWeekdayHour`, `totals` and their tests, including the hour axis rule, satisfies **AC-5**, **AC-7**. 22 unit tests added (`lib/report/range.test.ts`, `lib/report/buckets.test.ts`), including the 100% cap, an hour outside opening hours, a `24:00` close, an empty range, and the axis widening rule.
4. [x] The toolbar (preset chips, court `Select`), the four tiles, the three charts each with its hidden table, and the current hours caveat line, satisfies **AC-6**, **AC-7**, **AC-11**. One deliberate divergence from AC-6's literal wording: the heatmap is a plain CSS grid rather than a third Recharts chart, using the swap the spec's own Consequences section names as open ("the heatmap is a Recharts scatter or a plain CSS grid, whichever `/develop` finds cleaner; the spec pins its content and accessibility, not its drawing primitive"). It still carries the three shade levels, the Low/Medium/High legend, a hover tooltip (native `title`, showing booked hours and utilisation) and the same paired hidden table as the two Recharts bar charts.
5. [x] The day list: `getDayReservations`, the day link from the by day bar and its table, the Day section with Close, the struck through cancelled rows with who and when, satisfies **AC-8**
6. [x] The CSV route handler with the `401` and `403` paths, the headers, and the Download CSV link, satisfies **AC-9**. One infrastructure fix along the way: `proxy.ts`'s matcher excluded any path ending `.csv` (meant for real static files), which let this route skip Clerk entirely and made `auth()` throw; and `isStaffRoute()`'s blanket `auth.protect()` would otherwise have answered a signed out request with a redirect or Clerk's own 404 rather than this route's typed `401`. Fixed by adding `/staff(.*)` to the matcher (so Clerk always runs under `/staff`) and carving this one route out of `isStaffRoute()` so it answers its own door. Confirmed live: a signed out `curl` against `/staff/reports/usage.csv` now returns `401 Sign in to download this report.`; `/staff`, `/staff/settings` and `/staff/reports` still redirect to `/sign-in` as before, and the public board still returns `200`.
7. [x] `loading.tsx`, the empty range note, and the single failure notice for the usage read, the day read and the CSV, satisfies **AC-10**
8. [ ] Prove it live on the real project against a seeded week, as an owner and as a staff member, satisfies **AC-13**. Not done: this build ran with no authenticated browser session available, so the owner walkthrough (tiles and by hour chart matching a hand count, the retired court denominator, the cancelled row in the day list, the CSV totals) has not been driven end to end. `npm run check` is green (lint, format, typecheck, 332 tests including 22 new ones) and `npm run build` succeeds; the migration itself was proven live in step 1. This is the one open item before the feature can be called done.

## Consequences

**Positive**

- Ella gets the staffing and hours answer from data the schedule already keeps; nothing new has to be written day to day for the report to be right.
- One query per page load, split in Postgres, so the page stays fast as history grows, and the same rows feed the CSV without a second code path.
- Who cancelled a booking becomes a plain column any later screen (the staff board, a customer history) can show without reading the audit trail.
- Owner only is enforced where the project enforces everything else, in Postgres, so a future staff facing screen cannot leak the aggregate by mistake.

**Negative and tradeoffs**

- Recharts adds a client side dependency of roughly a hundred kilobytes gzipped (as of my knowledge; check the installed version) to one owner page, and a library to keep current. Three hand drawn SVG charts would have cost nothing to ship and been theme aware for free; the trade is faster chart iteration for one more package.
- Utilisation uses today's opening hours and live courts for every day in the range. A past month with longer hours or an extra court reads a little high or low. The caveat line is honest, but the number is not exact history. An opening hours history table is deferred, not refused.
- The audit backfill trusts `reservation_audit`; a cancelled row with no matching audit row falls back to `updated_at` and a null `cancelled_by`. That is at most a few rows from before this migration.
- Presets only. A question about one odd fortnight has no direct answer; the nearest preset and the CSV are the workaround until custom dates are asked for.
- No live updates on this page, by choice. A day list can go stale for as long as the tab stays open.

**Neutral**

- Owner only is a role check, so staff never see the Reports link; nothing about the staff board changes.
- `cancelReservation` is untouched; the trigger does the stamping. Anyone reading the action should know the columns are filled a layer down.
- The heatmap is a Recharts scatter or a plain CSS grid, whichever `/develop` finds cleaner; the spec pins its content and accessibility, not its drawing primitive.
- The `recharts` skill was installed at `.agents/skills/recharts/` during this design; the `pxnt/chart-mcp` server was declined as not fitting (it renders images, this page renders components).

## Follow-up

- [ ] `recharts` skill conventions are not yet in root `AGENTS.md` `## Agent skills`; add one bullet for it (`andy-spike/skills`, `.agents/skills/recharts/`) and add `pxnt/chart-mcp` to the `Declined:` line, so nothing offers it again. `/sync` owns the edit.
- [ ] Opening hours history: a table recording every change to hours and courts so past utilisation uses the hours in force then. Deferred; the caveat line on the page is the honest substitute until asked for.
- [ ] Custom from and to dates on the report, if a preset ever fails to answer a real question. The `range.ts` shape (a resolved inclusive pair of local dates) already fits it.
- [ ] A CSV of the day list, if Ella wants the rows and not just the numbers.
- [ ] The staff board's cancelled rows could show `cancelled_by` now that it is a column; spec 0005 hides cancelled rows today, so this only matters if that changes.
- [ ] The takings and unpaid report in the scope's Deferred list can live under `/staff/reports` beside this one when it is designed.
