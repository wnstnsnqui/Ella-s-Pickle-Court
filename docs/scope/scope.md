# Scope: Ella's Pickle Court Court Monitor

A court booking schedule for Ella's Pickle Court. Pick a day and see time down the side and a column per court, with every cell reading Booked, Available or Unavailable. Staff keep it, players read it before they come, and Ella can look back at how the courts were used.

**Build approach:** Tracer Bullet (prove the whole path works end to end, narrow but real, before thickening any part of it).
**Workflow:** Beta (after `/develop`, run `/check verify`, then `/test`). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· GA`) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | done |
| 2 | Coding standards & tooling | Foundation | done |
| 3 | Data model | Foundation | in-progress |
| 4 | Design system & UI foundation | Foundation | done |
| 5 | Staff sign in | Slice 1 | in-progress |
| 6 | Staff booking schedule | Slice 1 | done |
| 7 | Public schedule board | Slice 1 | in-progress |
| 8 | Courts & opening hours | Slice 2 | done |
| 9 | Session history | Slice 3 | dropped |
| 10 | Usage reporting | Slice 4 | done |
| 11 | Analytics & error alerts | Slice 5 | done |
| 12 | Privacy, terms & cookie notice | Slice 5 | in-progress |
| 13 | Staff roles & admin access | Slice 5 | done |
| 14 | Landing page | Slice 6 | done |
| 15 | Board day switch in the browser | Slice 6 | done |
| 16 | Online booking checkout | Slice 7 | in-progress |
| 17 | Staff check of online bookings | Slice 7 | in-progress |
| 18 | Booking receipt & lookup | Slice 7 | in-progress |
| 19 | Voucher codes | Slice 7 | planned |

## Foundations

### 1. Stack & architecture · done
The repo is an untouched Next.js starter, so the load bearing choices are all still open: where data lives, how staff sign in, how a change reaches every open screen by itself, and where it is hosted.
**Done when:** the stack is recorded in a spec and the scaffold boots locally, builds clean, and can push a live update to a second open browser.
spec [0001](../specs/0001-stack-architecture/index.md) · code in `app/`, `lib/`, `proxy.ts`, `supabase/`, `Dockerfile`
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
  - [x] Dependencies, container build, and the health endpoint
  - [x] The two Supabase clients, the Clerk join, and the Server Action guard
  - [x] Smoke migration written: table, trigger, broadcast, and the policies
  - [x] Migration applied to a real Supabase project and the live update seen in a second browser
  - [x] The staff write path proven end to end (watched live: a signed in bump moved two other browsers from version 5 to 6 with no reload, and `changed_by` holds the Clerk user id)
- [x] Verify it: `/check verify stack & architecture`
- [x] Test it: `/test stack & architecture`

_Closed on 2026-09-03 with three checks deliberately deferred, none of them failures: a Clerk token refresh across a long lived tab and the two tab version conflict as seen by a person (the conflict itself is pinned by an automated test), and `docker build`, which needs Docker installed. The first two belong with feature 5, the third with picking a host._

### 2. Coding standards & tooling · done
Capture the conventions from the real scaffolded project, then install the lint, format, and type checks every later slice has to pass.
**Done when:** root `AGENTS.md` reflects the real stack, and lint, format, and type check all run clean.
code in `.prettierrc.mjs`, `.prettierignore`, `eslint.config.mjs`, `package.json`
- [x] Capture conventions + tooling choices: `/audit`
- [x] Install the tooling: `/develop tooling`

### 3. Data model · in-progress
The entities every screen reads: courts, the bookings and closures that occupy them, staff accounts, and the venue's opening hours. A booking is a court plus a start and an end, and the database itself refuses two that overlap. Getting this wrong is the most expensive thing to redo.
**Done when:** a day's schedule for every court can be read and written cleanly, two staff cannot double book the same hour, nothing personal reaches the public page, and the shape carries the history reporting will need without a breaking change.
spec [0002](../specs/0002-data-model/index.md) · code in `supabase/migrations/`, `lib/schedule/`, `lib/supabase/`, `lib/time.ts`
- [x] Design it (spec): `/architect data model`
- [x] Build it: `/develop data model`
  - [x] The shared value lists and their Zod schemas, defined once (AC-12)
  - [x] One migration: the four tables, the overlap constraint, the grants and policies, the narrowed broadcast trigger, the audit trigger, and the seed, applied and checked with `db advisors` (AC-1, AC-2, AC-3, AC-4, AC-6, AC-8, AC-9, AC-10)
  - [x] Generated database types, and the grid derivation module that turns a day plus the settings into labelled cells in `Asia/Manila` (AC-5, AC-11, AC-12)
  - [x] The public and staff read paths, and the Server Actions for booking, editing, cancelling, courts and settings (AC-2, AC-4, AC-6, AC-7, AC-8)
  - [x] The thread proven live: a booking made by signed in staff turns the cell Booked in a second browser, and a concurrent duplicate is refused (AC-2, AC-9) · proven under feature 6 on the real project, the duplicate with one account in two browsers
- [ ] Verify it: `/check verify data model`
- [ ] Test it: `/test data model`

### 4. Design system & UI foundation · done
The visual language for a schedule grid read on a phone, often outdoors. Booked, Available and Unavailable have to be tellable apart at a glance, and a grid is a hard thing to read on a small screen.
**Done when:** `design.md` covers type, color, spacing, and the schedule cell and grid components, the three cell states are distinguishable without relying on color alone, the grid is usable on a phone, and base components meet WCAG AA for contrast, focus, and keyboard use.
spec [0003](../specs/0003-design-system-ui-foundation/index.md) · code in `app/globals.css`, `app/design/`, `components/`, `docs/design.md`, `eslint.config.mjs`
- [x] Design it (spec): `/architect design system & UI foundation`
- [x] Build it: `/develop design system & UI foundation`
  - [x] Tokens and the surface that proves them: Inter, shadcn initialised, the token layer with its lint rule, and the `/design` page (AC-1, AC-3, AC-15)
  - [x] The state vocabulary, verified: the base components, `ScheduleCell` in all seven views, contrast and grayscale checked at AA (AC-4, AC-5, AC-14)
  - [x] The grid itself: the compact 12 hour formatter, the pinned time column inside a sideways scroller, the ARIA grid with a roving tabindex, and the legend (AC-6, AC-7, AC-8, AC-9)
  - [x] An honest board: the shell, day navigation, the live indicator with its delay, the changed cell highlight, and the loading, empty and error states (AC-10, AC-11, AC-12, AC-13)
  - [x] Finish it: the type only assets and `docs/design.md` (AC-2, AC-16)
- [ ] Verify it: `/check verify design system & UI foundation`
- [x] Test it: `/test design system & UI foundation`

## Slice 1: The schedule loop

This slice is the walking skeleton. One real thread: a staff member signs in, books a court for an hour, and a player watching the public schedule sees that cell turn Booked. Real accounts, real storage, real live updates, narrow on purpose.

### 5. Staff sign in · in-progress · GA
Only staff can change the schedule. Accounts also mean you can tell who booked or changed what, which is what makes the schedule trustworthy.
**Done when:** a staff member can sign in and out, sessions survive a refresh, signing in creates their `staff` row carrying a role and an active flag (every policy in spec 0002 depends on it), accounts exist only through a one time link an owner made, and no signed out visitor can change anything.
spec [0004](../specs/0004-staff-sign-in/index.md) (revised 2026-09-19: Clerk replaced by Better Auth; every build step is coded as of 2026-09-19 and `npm run check` is green, but migrations 20260919064807 and 20260919064809 are not yet pushed and nothing is proven live) · code in `app/sign-in/`, `app/sign-up/`, `app/reset/`, `app/api/auth/`, `lib/auth.ts`, `lib/auth/`, `lib/supabase/staff-token.ts`, `lib/staff.ts`, `components/staff-menu.tsx`, `components/auth-surface.tsx`, `supabase/migrations/`
- [x] Design it (spec): `/architect staff sign in`
- [ ] Build it: `/develop staff sign in`
  - [ ] Better Auth in place of Clerk: the packages, `lib/auth.ts` with the invite gate, the `better_auth` schema and role, the `staff` re key and `staff_invite` migration, env and dashboard steps (AC-1, AC-3, AC-5, AC-10, AC-11, AC-14)
  - [ ] The thin thread proven live: bootstrap the owner at `/sign-up`, the minted Supabase token behind `staffSupabase()`, `currentStaff()` and `requireStaff()` on Better Auth, `proxy.ts`, sign in and sign out, one booking with `changed_by` set (AC-2, AC-4, AC-5, AC-6, AC-10)
  - [ ] Invite links end to end: make, show once, list, revoke on the users screen; `/sign-up/[token]` by username and password; a raw sign up request refused (AC-1, AC-3, AC-4, AC-5)
  - [ ] Reset links, deactivation ending sessions, and the account sheet (AC-7, AC-8, AC-9)
  - [ ] Finish: the staff listener as anon, analytics events and identify, the four forms polished with `noindex` and contrast, Clerk fully removed, unit and database tests green (AC-11, AC-12, AC-13, AC-15, AC-16)
- [ ] Verify it: `/check verify staff sign in`
- [ ] Test it: `/test staff sign in`
- [ ] Review it (fresh model): `/check review staff sign in`
- [ ] Document it: `/document staff sign in`

### 6. Staff booking schedule · done
The screen staff use all day, most likely on a phone or a tablet at the desk. Taking a booking has to be a few taps, because a schedule that is slow to update is a schedule that stops being updated.
**Done when:** a signed in staff member picks a day, sees the grid for every court, can book a cell with a customer name and optional phone, note and payment record, can edit or cancel a booking, can close a court for a stretch of hours, and every change is saved and visible immediately. A double booking is refused with a clear message rather than an error.
spec [0005](../specs/0005-staff-booking-schedule/index.md) · code in `app/staff/`, `components/staff/`, `components/schedule/`, `lib/schedule/`, `lib/supabase/staff-browser.ts`, `proxy.ts`
- [x] Design it (spec): `/architect staff booking schedule`
- [x] Build it: `/develop staff booking schedule`
  - [x] The protected page and the thin thread: `/staff` behind `proxy.ts`, the redirects and menu link, the staff list on the read, `createReservations`, the selection module, the board with its bar and a name only Book sheet, one booking proven in a second browser (AC-1, AC-3, AC-4, AC-12, AC-16)
  - [x] Live: the staff listener carrying the Clerk token, the refetch on every broadcast, and the selection pruned with a toast (AC-10)
  - [x] The forms and the refused path: react-hook-form, the full Book and Close court sheets, sheet side by viewport, and the slot taken handling (AC-4, AC-5, AC-6, AC-15)
  - [x] Details, edit, cancel, past and role: the details sheet with names, the edit forms and the stale version reload, the confirm dialog, the customer name on cells, and the lock for ended slots (AC-2, AC-7, AC-8, AC-9, AC-11)
  - [x] Finish: retries and bounds, the seven view legend, keyboard and contrast, and the concurrent double booking proof with two staff (AC-13, AC-14, AC-15, AC-16) · the race ran with one account in two browsers, a second staff account would make it exact
- [x] Verify it: `/check verify staff booking schedule`
- [x] Test it: `/test staff booking schedule`

### 7. Public schedule board · in-progress
The page players open before they drive over. Read only, no sign in, and it updates by itself within a second or two so nobody is looking at a stale grid.
**Done when:** anyone can pick a day and see each court's hours as Booked, Available or Unavailable, a change made by staff appears without a reload, no customer name, phone, note or amount is reachable from the page or its live updates, the read is rate limited, and the page carries a proper title, description, and social card when shared as a link.
spec [0006](../specs/0006-public-schedule-board/index.md) · code in `app/schedule/` (moved from `app/page.tsx` on 2026-09-26, spec 0013), `app/loading.tsx` (moving to `app/schedule/loading.tsx`), `app/api/schedule/`, `components/board/`, `components/board-notice.tsx`, `components/schedule/read-gate.ts`, `components/schedule/use-schedule-channel.ts`, `lib/rate-limit.ts`, `proxy.ts`; the calendar date picker (spec [0011](../specs/0011-calendar-date-picker/index.md)) folds in here too, code in `components/day-nav.tsx`, `components/date-picker.tsx`, `components/board-sheet.tsx`, `components/use-media-query.ts`, `components/ui/calendar.tsx`, `components/ui/popover.tsx`
- [x] Design it (spec): `/architect public schedule board`
- [ ] Build it: `/develop public schedule board`
  - [x] The thin thread: `/` becomes the board on `getSchedule()` with the day range rule, the notice, the empty, error and loading states, and `GET /api/schedule`, proven against a staff booking after a reload (AC-1, AC-2, AC-12)
  - [x] Live: the base listener hook extracted from the staff board, the public hook on the anonymous client, one booking seen in a signed out browser with no reload, and the privacy proof over the JSON and the HTML (AC-5, AC-7, AC-13)
  - [x] Honest when not live: the slow poll, the focus refetch, the 429 wait, and the board following the venue's day at midnight (AC-6, AC-9, AC-10)
  - [x] The limiter in `proxy.ts` with its tests (AC-8)
  - [x] The phone conveniences and the metadata: the next free strip, dimmed past hours, the now marker and scroll, the per day title, the canonical link and the JSON-LD block (AC-3, AC-4, AC-11)
  - [x] Calendar date picker (spec 0011): the `Pick a date` button on `DayNav` opening a shadcn `Calendar` inside the promoted, shared `BoardSheet`, bounded to the booking window and the staff/public past rule, on both boards; `BoardSheet`/`useMediaQuery` promoted out of `components/staff/` (spec 0011, all ACs)
  - [ ] The move to `/schedule`: the board, its canonical and its notice link at `/schedule`, the `/?date=` redirect, the shared limit window with `/`, no JSON-LD on the board, and the loading skeleton moved to `app/schedule/loading.tsx` (spec 0006 task 11; AC-1, AC-2, AC-8, AC-11, AC-12)
- [ ] Verify it: `/check verify public schedule board`
- [ ] Test it: `/test public schedule board`

## Slice 2: Manage the courts

### 8. Courts & opening hours · done
Add a court, rename it, reorder it, retire it, and change the hours the venue is open, without touching the database by hand. Owner only, because these change what everyone else sees.
**Done when:** an owner can add, rename, reorder, and retire a court, and can set opening and closing times for each day of the week, mark a day closed, and change the slot length and how far ahead staff may book. Retiring a court that still has future bookings is refused and says how many are in the way. Both boards reflect every change straight away.
spec [0007](../specs/0007-courts-opening-hours/index.md) · code in `app/staff/settings/`, `components/settings/`, `components/staff-menu.tsx`, `components/schedule/use-schedule-channel.ts`, `components/staff/closed-day-sheet.tsx`, `components/board/venue-json-ld.tsx`, `components/date-picker.tsx`, `lib/schedule/actions.ts`, `lib/schedule/queries.ts`, `lib/schedule/schemas.ts`, `lib/schedule/grid.ts`, `lib/schedule/outside-hours.ts`, `lib/report/buckets.ts`, `lib/time.ts`, `supabase/migrations/20260915044956_courts_opening_hours.sql`, `supabase/migrations/20260922155618_venue_hours_per_day.sql`, `supabase/migrations/20260922160528_save_venue_hours.sql`
- [x] Design it (spec): `/architect courts & opening hours`
- [x] Build it: `/develop courts & opening hours`
  - [x] The migration and the thin thread: the unique name index, the widened sort order check, the midnight check, `reorder_courts`, the shared broadcast trigger, the listener learning two events, `getOwnerSettings()`, the owner only `/staff/settings` page with its menu link and skeleton, and Add court proven live in a second browser (AC-1, AC-2, AC-3, AC-4, AC-5, AC-8, AC-11)
  - [x] The court list in full: rename with the name clash on the field, the optimistic reorder with locked controls, retire through the confirm dialog with the count, and the retired disclosure with Restore (AC-4, AC-5, AC-6, AC-7, AC-13)
  - [x] Opening hours: `24:00` as a close time through the schema, the grid math and the labels, the form with dirty tracking, and the two step save that warns with the count of bookings left outside the hours (AC-8, AC-9, AC-10, AC-13)
  - [x] Finish: the out of range day on both boards, keyboard, names and contrast, and the full live proof on the real project (AC-12, AC-14, AC-15)
- [x] Verify it: `/check verify courts & opening hours` (skipped on 2026-09-15; the live owner walkthrough in `verify.md` was not run, marked done by the engineer)
- [x] Test it: `/test courts & opening hours` (skipped on 2026-09-15; helper unit tests exist, no component or hook tests)

**Revision, 2026-09-22: opening hours per day of the week.** The weekday and weekend pair could not say that Friday runs until midnight while the other weekdays do not, and could not say a day is closed at all. Spec [0007](../specs/0007-courts-opening-hours/index.md) is revised in place (AC-16 to AC-25).
- [x] Design it (spec): `/architect opening hours per day`
- [x] Build it: `/develop opening hours per day`
  - [x] The migration and the read path end to end: the `venue_hours` table with its checks and grants, the seven rows backfilled from the four columns and those columns dropped, its own broadcast trigger, and every read looking up the day instead of asking whether it is a weekend, proven live with a late Friday (AC-16, AC-18, AC-24)
  - [x] The write path: `save_venue_hours` writing the week in one transaction against the settings version, the revised save action and schema, and the seven row form with its Closed toggles and the two step stranded booking save (AC-8, AC-9, AC-17)
  - [x] The closed day everywhere it shows: the grid span and cell rules, the staff board's closed line with Add booking, the public board's greyed grid, the muted dates in the picker, and the grouped JSON-LD (AC-19, AC-20, AC-21, AC-22)
  - [x] Finish: the usage report's per day open minutes and widened hour axis, the reshaped analytics payload, the keyboard and contrast pass, and the live proof (AC-23, AC-24, AC-25)
- [x] Verify it: `/check verify opening hours per day` (2026-09-23; every acceptance criterion exercised against the linked project in a real browser, except the report's zero open minutes, which the project has no past booking data to show, and the PostHog event, which needs dashboard access)
- [x] Test it: `/test opening hours per day` (2026-09-23; 25 tests added over the gaps the build left: `dayOfWeek`, `keysInRange`, `isClosedDay` and the picker's muting, and the report's closed day maths)

## Slice 3: Look back at the day

### 9. Session history · dropped
_Dropped on 2026-09-05, folded into feature 10. Spec 0002 makes the reservation table the history itself: every booking, closure and cancellation is stored with its start and end from the first migration, so there is no separate history to build. Kept here so the plan shows why it went._

## Slice 4: Understand the usage

### 10. Usage reporting · done
The view Ella opens to see busy and quiet times, so staffing and opening hours can follow the real pattern. Reads straight off the bookings, with no separate history to build. Money is out of scope here and waits in the Deferred list.
**Done when:** court usage can be seen by hour and by day across a chosen date range, per court and across all courts, counting only booked time and ignoring closures, and a day's bookings including the cancelled ones can be read back.
spec [0008](../specs/0008-usage-reporting/index.md) · code in `app/staff/reports/`, `components/reports/`, `lib/report/`, `supabase/migrations/20260915120000_usage_reporting.sql`
- [x] Design it (spec): `/architect usage reporting`
- [x] Build it: `/develop usage reporting`
  - [x] The migration: `cancelled_at` and `cancelled_by` stamped by a trigger and backfilled from the audit trail, and the owner only `court_usage` function that splits active bookings into hourly minutes, applied with advisors clean (AC-3, AC-4)
  - [x] The thin thread: the preset range resolver, the owner gated `/staff/reports` page with its menu link, and one query to a number on screen, with a staff account proven redirected (AC-1, AC-2, AC-12)
  - [x] The report in full: the bucket functions and utilisation, the toolbar, the four tiles, and the three charts (two Recharts bar charts, the heatmap a CSS grid per the spec's own Consequences note) each with its hidden table and the current hours caveat (AC-5, AC-6, AC-7, AC-11)
  - [x] The day list with cancelled rows struck through and who cancelled, and the CSV download with its `401` and `403` paths (AC-8, AC-9)
  - [x] Finish: skeleton, the empty range note and the single failure notice are done (AC-10); the live proof on the real project against a seeded week (AC-13) was not run — no authenticated owner session was available in this build to drive it — marked done by the engineer on 2026-09-15
- [x] Verify it: `/check verify usage reporting` (returned BLOCKED on 2026-09-15: the `court_usage` owner check bug it found was fixed by `/debug`, but the 14 step manual owner walkthrough in `verify.md` was never run, for the same reason — no browser session or real Clerk sign in in this environment; marked done by the engineer)
- [x] Test it: `/test usage reporting` (ran on 2026-09-15, scoped by the engineer to the 5 highest risk files: `lib/report/schemas.ts`, `lib/report/csv.ts`, `lib/report/queries.ts`, the CSV route handler, and `proxy.ts`'s auth carve out, 60 tests, all passing; the 14 `components/reports/*` files and `app/staff/reports/page.tsx`/`loading.tsx` have no tests; marked done by the engineer)

## Slice 5: Ready for the public

### 11. Analytics & error alerts · done
Know whether staff really keep the schedule current, whether players use the public page, and get told when something breaks in the wild.
**Done when:** page views and booking events are recorded, and an error in production reaches you without a customer reporting it.
spec [0009](../specs/0009-analytics-error-alerts/index.md) · code in `lib/analytics/`, `instrumentation.ts`, `instrumentation-client.ts`, `app/error.tsx`, `app/global-error.tsx`, `app/staff/layout.tsx`, `components/analytics/`, `components/board/board-day-viewed.tsx`, `next.config.ts`, `proxy.ts`
- [x] Design it (spec): `/architect analytics & error alerts`
- [x] Build it: `/develop analytics & error alerts`
  - [x] Three thin threads proven on a local production build: one cookieless public page view through `/ingest` and `board_day_viewed`, staff identified on `/staff`, and `booking_created` from a Server Action, all confirmed live in PostHog's activity feed on 2026-09-16; the off switch when the key is empty is covered by an automated test, not a live proof (AC-1, AC-2, AC-3, AC-4, AC-9, AC-10) · the "one deliberate error reaching Discord" leg was not run: PostHog dropped its Discord integration, so the destination is Slack instead, and the alert itself was not proven live (AC-6, AC-7, AC-8)
  - [x] Every Server Action sends its event through the strict allow list, `failed` results are reported scrubbed, with unit tests for the scrubber and for a representative set of actions (`createReservation`, `createReservations`, `saveCourt`, `retireCourt`, `saveVenueSettings`); not every action/branch has its own test (e.g. `updateReservation`, `cancelReservation`, `reorderCourts`, and `saveCourt`'s `renamed`/`note`/`restored` branches are wired but untested) (AC-4, AC-5, AC-7)
  - [x] Staff identified by Clerk id with name and role, reset on sign out; the `board_day_viewed` event on the public board — confirmed live on 2026-09-16, two staff accounts identified separately with no merge (AC-2, AC-3)
  - [ ] The PostHog project itself: replay, autocapture and surveys off, Ella invited, her dashboard built and pinned, settings recorded in `verify.md` — not done; marked done by the engineer anyway on 2026-09-16 (AC-11, AC-12)
- [x] Verify it: `/check verify analytics & error alerts` (not run as its own pass; the live checks above were confirmed ad hoc in conversation instead, per `verify.md`. The PostHog project settings, the Slack alert, and per-action event tests remain unconfirmed. Marked done by the engineer on 2026-09-16)
- [x] Test it: `/test analytics & error alerts` (not run as its own pass; `npm run check` (lint, format, typecheck, unit tests) is green. Marked done by the engineer on 2026-09-16)

### 12. Privacy, terms & cookie notice · in-progress
The public page is open to anyone, you now hold customer names and phone numbers, and once analytics is in, visitors deserve to be told and asked.
**Done when:** privacy and terms pages exist and are linked, the privacy page states how long a customer phone number is kept and something actually enforces it, and if tracking is used, a consent notice gates it and remembers the answer.
spec [0010](../specs/0010-privacy-terms-cookie-notice/index.md) · code in `supabase/migrations/20260916022657_privacy_terms_retention.sql`, `lib/legal/`, `app/privacy/`, `app/terms/`, `app/staff/layout.tsx`, `components/staff/privacy-notice-dialog.tsx`, `components/legal-page.tsx`, `components/app-shell.tsx`
- [x] Design it (spec): `/architect privacy, terms & cookie notice`
- [ ] Build it: `/develop privacy, terms & cookie notice`
  - [ ] The migration and the thin proof: `pg_cron`, `purge_customer_phones()` clearing the phone from `reservation` and the audit JSON, the nightly schedule, the two `staff` columns, `ensure_staff()` widened, `acknowledge_privacy_notice()`, proven by hand on the real project and covered by database tests (AC-5, AC-6, AC-7, AC-8, AC-9) — migration applied and proven by hand; letting one night pass and reading `cron.job_run_details` still pending (AC-15)
  - [x] The staff acknowledgement: `lib/legal/constants.ts`, `currentStaff()` carrying the version, the Server Action with its event, and the blocking dialog in the staff layout with its four states and the version bump (AC-4, AC-10, AC-11, AC-12, AC-13, AC-14)
  - [x] The pages and the links: `/privacy` and `/terms` with metadata, every fact from the constants, and the footer links on every page (AC-1, AC-2, AC-3, AC-4, AC-7)
  - [ ] Finish: Ella's legal name, email and address in the constants, her read of both pages, the live acknowledgement seen in PostHog, `npm run check` and `npm run test:db` green (AC-13, AC-15)
- [ ] Verify it: `/check verify privacy, terms & cookie notice`
- [ ] Test it: `/test privacy, terms & cookie notice`

### 13. Staff roles & admin access · done
Winston becomes superadmin and gets a screen to see every staff account and assign or change roles, closing the gap spec 0004 left as a database editor job. Admin stands equal to owner everywhere except this new screen.
**Done when:** admin and superadmin roles exist alongside staff and owner, every owner gated surface treats owner, admin and superadmin alike, and a superadmin can see and change anyone's role or active status from `/staff/admin/users` with a confirm step and a written record of who changed what.
spec [0012](../specs/0012-staff-roles-admin-superadmin/index.md) · code in `supabase/migrations/`, `lib/staff.ts`, `lib/staff/`, `app/staff/admin/users/`, `components/staff-menu.tsx`, `components/staff/`
- [x] Design it (spec): `/architect staff roles & admin access`
- [ ] Build it: `/develop staff roles & admin access`
  - [x] The migration and the widened role model: the check constraint, `staff.version`, `staff_single_owner_idx`, `private.is_owner()` widened, `public.update_staff_role()`, `staff_audit`, and the TypeScript role type widened in `lib/staff.ts` (AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12)
  - [x] The thin thread: `getAllStaff()`, `/staff/admin/users` with its redirect, and the Users link in the staff menu (AC-1, AC-2)
  - [x] The write path: the role and active controls, the confirm dialog, `updateStaffRole`, and the analytics event (AC-3, AC-4, AC-5, AC-14)
  - [ ] Proof and tests: the owner transfer and audit trail proven live against the linked database, and the database and unit tests, are done (AC-9, AC-10); the one time SQL promoting Winston to superadmin is still owed (AC-13, Winston's own step)
- [x] Verify it: `/check verify staff roles & admin access`
- [x] Test it: `/test staff roles & admin access` (test files already cover this feature's area: `lib/staff.test.ts`, `lib/staff/actions.test.ts`, `components/staff-menu.test.ts`, `components/staff/roles.test.ts`, `supabase/tests/update_staff_role.test.ts`, `lib/import-boundaries.test.ts`, all passing)

## Slice 6: The front door

### 14. Landing page · done
`/` becomes the venue's front door: what it is, what it offers, a live look at both courts with a way to ask for hours, and where to find it. The board moves to `/schedule`. Booking online stays a signpost to Messenger or a text until its own spec.
**Done when:** `/` shows the top bar, hero, offers, court booking, visit and footer on the real schedule (both courts side by side, a day strip plus calendar, picks totalled at ₱250 an hour), the booking button honestly says online booking is coming and hands the picks to Messenger or a text, a failed read never shows an error but retries quietly and ends in a "message us to book" card, old `/?date=` links redirect to `/schedule`, and the page carries its metadata, JSON-LD, sitemap and robots.
spec [0013](../specs/0013-landing-page/index.md) · code in `app/(landing)/`, `components/landing/`, `lib/venue.ts`, `lib/legal/constants.ts`, `lib/schedule/`, `lib/analytics/`, `proxy.ts`, `next.config.ts`, `app/sitemap.ts`, `app/robots.ts`, `app/schedule/`
- [x] Design it (spec): `/architect landing page`
- [x] Build it: `/develop landing page`
  - [x] The thin thread: today's live read on `/`, both courts side by side with the five tile views, the mock data gone, `/` in the shared limiter with the over limit pass through, and the `/?date=` redirect (AC-2, AC-3, AC-4, AC-5, AC-11, AC-21)
  - [x] Other days and quiet failure: the day strip and calendar, the browser fetch with the newest request guard, the five quiet retries, the message card and toast, the `(landing)` error boundary, and the logging (AC-6, AC-7, AC-8, AC-9, AC-10, AC-23, AC-26)
  - [x] Picks and the live hero: selection across courts with the total, the coming soon toast with Messenger and Text us, the `booking_intent` event, the live hero board, chip and stats (AC-12, AC-13, AC-14, AC-15, AC-16)
  - [x] Content and discoverability: venue facts in `lib/venue.ts`, the two offers, grouped real hours on Visit, the metadata, the JSON-LD moved to `/`, sitemap and robots, and spec 0006 updated for `/schedule` (AC-17, AC-18, AC-19, AC-20, AC-22). Code landed; only the spec 0006 wording is left, owed to `/architect` (a spec edit `/develop` does not make)
  - [x] Tests and the final pass: the landing branches, the retry schedule, total, SMS body and hours grouping, the privacy assertion, and a keyboard and reduced motion pass in a real browser (AC-1, AC-24, AC-25)
  - [x] Amenities in the offers section: open play removed, Court rental beside four amenity tiles (guest wifi, parking, comfort rooms, outdoor courts) with badges, the new heading, the parking note, and the tile cascade on scroll (AC-17, AC-19, AC-27; spec 0013 build task 9, added 2026-09-26)
- [x] Verify it: `/check verify landing page` (2026-09-29: all run checks passed; marked done with two checks owed in verify.md, a closed weekday struck through at 1440 and the 3 day horizon, both needing a settings change)
- [x] Test it: `/test landing page` (test files already cover this feature's area: `app/(landing)/page.test.ts`, `components/landing/*.test.ts`, `lib/schedule/hours.test.ts`, `proxy.test.ts`)

### 15. Board day switch in the browser · done · from spec 0014
Changing day on the public and staff boards feels like the landing page: the next day is read in the browser with the old day dimmed meanwhile, a dropped request is retried quietly, and the address bar follows the day on screen with no reload.
**Done when:** an arrow tap or calendar pick on `/schedule` and `/staff` reads the day in the browser with no page render, only the newest read lands, transient failures retry at 1, 2 and 4 seconds before one toast with Try again, per day state resets as a remount did, and the URL and title name the day on screen.
spec [0014](../specs/0014-board-day-switch-browser/index.md) · code in `components/schedule/use-schedule-channel.ts`, `components/day-nav.tsx`, `lib/schedule/quiet-retry.ts`
- [x] Design it (spec): `/architect board day switch`
- [ ] Build it: `/develop board day switch`
  - [x] The public board thread: the hook owns the day, the gate pauses, `DayNav` controlled, `DayBoundary`, `replaceState` on land, proven with no RSC request (AC-1, AC-2, AC-3, AC-4, AC-8, AC-9)
  - [x] The staff board on the same path, the in browser `out_of_range` recovery, and the changed cell guard (AC-1, AC-7, AC-11)
  - [x] Quiet retries shared with the landing page, the snap back toast, the `429` and non retryable failures (AC-5, AC-6, AC-12)
  - [ ] The tab title, analytics and now marker per landed day, the older specs amended, and the real browser pass (AC-7, AC-10, every AC). Code, tests and the real browser pass landed; only the older spec amendments are left, owed to `/architect` (a spec edit `/develop` does not make)
- [x] Verify it: `/check verify board day switch` · 40 of 42 steps passed on 2026-09-29; accepted as known gaps: the PostHog `$exception` delivery (browser events are not reaching PostHog, a spec 0009 matter) and the highlight after a booking made elsewhere (needs a live booking)
- [x] Test it: `/test board day switch` · 831 passing on 2026-09-29; accepted gap: the hook's in browser behaviour (`useScheduleChannel`, `useChangedCells`, `BoardDayViewed`) has no jsdom test, proven by `/check verify` instead

## Slice 7: Book online

A player picks their hours on the landing page, taps Book, and walks a short sheet to a real booking with a code they keep. No player accounts: the booking code is how they find it again. Payment is a GCash transfer (the player scans the venue's GCash QR) with proof attached, which staff then check, not money taken inside the app. Every screen here shares the landing page's look and motion, built with the `apple-design`, `emil-design-eng` and `animate` skills.

### 16. Online booking checkout · in-progress · GA
The sheet that opens from Book once hours are picked, replacing the coming soon toast: booking details with name, phone, email and an optional voucher field, then the terms with a checkbox, then payment (the venue's GCash QR, the last 4 digits of the reference number, and a screenshot of the transfer), then a review with Confirm booking, ending on the receipt with the booking code. This is the first time the public writes to the database, so it carries its own tier.
**Done when:** picks on `/` open the sheet with the courts, hours and total; each step checks its fields before Next and Back keeps what was typed; the terms must be ticked to go on; Confirm books every picked slot in one go or refuses cleanly, naming the slot someone else took meanwhile; the new booking shows Booked on both boards straight away and waits as not yet checked for staff; one code covers every slot in the booking; the screenshot is stored privately and never reachable from a public page; the price is worked out on the server, never trusted from the browser; the write is rate limited and resists spam; the privacy page names the new email, reference digits and screenshot and how long each is kept; the sheet feels like the landing page, works on a phone, from the keyboard, and with reduced motion.
spec [0015](../specs/0015-online-booking-checkout/index.md) (a 5 minute hold on the way to payment, the write through an `online_booking` role the server mints a token for after Turnstile, the price in `venue_settings.hourly_rate`; the voucher field moves to feature 19) · code in `lib/booking/`, `components/landing/checkout-sheet.tsx`
- [x] Design it (spec): `/architect online booking checkout`
- [x] Build it: `/develop online booking checkout`
  - [x] The thin thread: the `booking` table, `hourly_rate`, the `online_booking` role and bucket, `hold_online_booking`, the minted token and the hold action, Details and a bare Terms; a hold proven Booked in a second browser, an upload proven under the custom role, the anon key refused (AC-1, AC-2, AC-4, AC-17, AC-18, AC-20)
  - [x] The front door and payment: Turnstile and the database rate limit, the refusals and the clash back into the picker, the Payment step with the shrink and upload, Review, `submit_online_booking` and the full receipt (AC-3, AC-6, AC-7, AC-8, AC-9, AC-11, AC-12, AC-14, AC-19) · happy path run in a real browser at 360 pixels on the linked project with Turnstile's test keys; `submit_online_booking` already carries the retake and the slot gone path (AC-12, AC-13), proven by a direct call; a `storage.objects` trigger now locks the proof after submit, because a signed upload URL skips the storage policies
  - [x] The hold's life and one price: the minute expiry job, update in place, the countdown's end, the retake and the refund path, release on close, the day list filter, `hourly_rate` across the landing page and the checkout switch (AC-5, AC-10, AC-13, AC-15, AC-16, AC-17, AC-26) · `expire_online_holds()` runs every minute on the linked project and `release_online_booking` is proven by `supabase/tests/online_booking_hold_life.test.ts`; with no read, the landing page leaves the price out rather than guess it; the switch now also waits on the real QR and account name, so checkout stays off until Ella supplies them
  - [x] Staff, privacy and signals: the Online booking block in the staff details sheet, `/privacy` and `/terms`, the detail purge and the `purge-payment-proofs` Edge Function, the three analytics events (AC-21, AC-22, AC-23, AC-24) · migration applied and the function deployed on the linked project; a `pg_net` call through Vault returned 200 `{"deleted":0}` and a wrong secret 401; `supabase/tests/online_booking_retention.test.ts` passes
  - [x] Finish: step motion and reduced motion, focus, keyboard and 360 pixel passes, database and unit tests, a real browser run of the critical scenarios, `npm run check` green (AC-25, every AC) · steps slide in 12 pixels from the side you are heading over `--dur-step` (220ms) and swap in place with reduced motion; the sheet's close button is now 44 pixels on every `BoardSheet`; `online_booking_hold` and `online_booking_submit` database tests (25 cases) on the linked project; unit tests for the schemas, the code, the shrink and upload, and all three actions; browser run at 360 pixels through Review and a released close (Confirm was not pressed, so no real booking was left on the board)
  - [x] The checkout card (spec amendment 2026-10-02): a centered card with a soft overlay, the five segment progress bar, icon headers, the hold banner, the Selected courts and slots card, three consent boxes with the reworded first rule and `BOOKING_TERMS_VERSION` `2026-10-02`, Review in three cards, and a receipt reading "Booking confirmed" while staff still see "Payment not yet checked" (AC-1, AC-3, AC-8, AC-10, AC-11, AC-14, AC-15, AC-22, AC-25, AC-27) · a Radix dialog over `--overlay-soft` with the card's own enter and exit in `app/globals.css`; the runs card and the summary line in `components/landing/checkout-selection.tsx`; `consent` is three Zod literals; walked in a real browser at 360 and 1280 pixels through a hold, an upload, Review, the back arrow and a released close (focus returned to "Your booking"); Confirm was not pressed, so the receipt is pinned by `components/landing/checkout-receipt.test.ts` instead
- [ ] Verify it: `/check verify online booking checkout`
- [x] Test it: `/test online booking checkout`
- [x] Review it (fresh model): `/check review online booking checkout`
- [x] Document it: `/document online booking checkout`

### 17. Staff check of online bookings · in-progress
Staff see each online booking waiting for its payment check, open the screenshot beside the reference digits and amount, and confirm it or turn it down. Without this the loop never closes, because a transfer nobody checks is not a booking anybody trusts.
**Done when:** a new online booking reaches the staff board live and stands out from a desk booking; staff can open its proof and confirm it (payment recorded as paid) or reject it with a reason (the slots free up on both boards); every decision records who made it and is guarded by the row's version; the customer's status on the lookup page follows the decision.
spec [0016](../specs/0016-staff-check-online-bookings/index.md) (a To check chip and list on the staff board; only owner, admin or superadmin confirm, turn down or cancel, through role checking Postgres functions that always write a `booking_event`; refunds owed tracked with Mark refunded; a prefilled text to the player; a row guard trigger keeps online rows in step) · code in `lib/online-checks/`, `components/staff/`, `lib/schedule/queries.ts`, `supabase/migrations/`
- [x] Design it (spec): `/architect staff check of online bookings`
- [ ] Build it: `/develop staff check of online bookings`
  - [ ] The thin thread: confirm. `booking_event`, the refund columns, `confirm_online_booking`, the `booking_changed` broadcast, the staff proof policy, the chip, the To check list and the sheet with the screenshot and Confirm, proven live from a player's submit to a second board (AC-1, AC-2, AC-6, AC-7, AC-15, AC-17)
  - [x] Turn down, cancel and the message: the row guard trigger with its transaction flag, `reject_online_booking`, `cancel_online_booking`, the sheet owning the online footer, the reason steps, the refund checkbox and the prefilled text (AC-8, AC-9, AC-10, AC-15) · migrations applied on the linked project; `supabase/tests/online_checks.test.ts` passes (13 cases, every AC-15 refusal); the step, refund default and message checked in a browser at 360 pixels, not submitted
  - [x] Refunds owed: `settle_online_refund`, the paid after hold trigger and backfill, the Refunds owed section, Mark refunded and No refund needed (AC-12, AC-13) · applied; the backfill marked 9 existing paid after hold bookings owed; settle and the late submit trigger pass the database tests
  - [ ] The board and the edges: the globe and captions, the toast, find by code, time tags, History, the contact copy, the stale refresh (AC-3, AC-4, AC-5, AC-11, AC-14, AC-16)
  - [ ] Retention, signals and finish: the proof purge kept while a refund is owed, notes purged, the four events, keyboard and 360 pixel passes, database and unit tests, a browser run with an admin and a plain staff account (AC-18, AC-19, AC-20)
- [x] Verify it: `/check verify staff check of online bookings` · ticked by the engineer on 2026-10-03 after a partly blocked run; the chip, list, find by code, check view, screenshot, 360 pixel list and sheet, `npm run check`, database tests and advisors passed in a real run; the decision buttons, the plain staff view, the live toast and the board marker were not exercised (see `verify.md`, unticked steps)
- [ ] Test it: `/test staff check of online bookings`
- [x] Review it (fresh model): `/check review staff check of online bookings` · ran on 2026-10-03, verdict Blocked: the uncommitted `lib/venue.ts` turns checkout back on (undoes `81dec21`), and the row guard leaves a decided booking's `payment_status` and `amount` open (AC-11 vs AC-15); see `docs/reviews/2026-10-03-main.md`

### 18. Booking receipt & lookup · in-progress
The receipt shows booking details, customer details and payment, as the last step of checkout and on a new public page where a customer types their booking code to see where their booking stands. Either place can download it.
**Done when:** a valid code shows the receipt with where the booking stands (Confirmed, Cancelled with a reason, or Not booked, and any refund); an unknown code says so plainly without hinting at other codes; codes cannot be guessed and lookups are rate limited; the receipt downloads as a file that reads well printed or on a phone; the lookup page is not indexed and shows only what the code's holder should see.
spec [0017](../specs/0017-booking-receipt-lookup/index.md) (`/booking` by code through a server minted `booking_lookup` role; contact masked; Confirmed, Cancelled with a reason, or Not booked, plus refunds; 5 wrong codes per 15 minutes counted in Postgres; ended 30 days after the last slot; Save as PDF through print) · code in `app/booking/`, `components/receipt/`, `lib/booking/`, `supabase/migrations/`
- [x] Design it (spec): `/architect booking receipt & lookup`
- [x] Build it: `/develop booking receipt & lookup` · built 2026-10-04; `npm run check` green, migration `20261003153632_booking_lookup.sql` applied and live, 12 database tests passing
  - [x] The thin thread: the `booking_lookup` role, `booking_lookup_miss`, `lookup_online_booking` (found and not found), the third minter, `lookupBooking` and a bare `/booking`, proven against a real submitted booking with the anon key refused (AC-1, AC-2, AC-3, AC-8, AC-18)
  - [x] Every state on one receipt: `components/receipt/` and `buildReceiptView()` with checkout switched onto it, masked contact, Cancelled with its reason, refund lines, Not booked, Ended (AC-3, AC-4, AC-5, AC-6, AC-7, AC-9)
  - [x] The limit and the edges: the miss count under its lock, the limited and failure cards, Check again and the read on return (AC-10, AC-12, AC-13)
  - [x] Downloads and ways in: the print stylesheet and Save as PDF on both receipts, Save as image on the lookup, Track this booking, the Find my booking links, the staff text line (AC-11, AC-14, AC-15, AC-16, AC-17) · checkout's Save as PDF and Track this booking are pinned by `checkout-receipt.test.ts`, not printed from a live checkout (checkout is off)
  - [x] Privacy, signals and finish: the miss purge, the `/privacy` line, the `booking_lookup` event, motion, keyboard and 360 pixel passes, database and unit tests, a browser run with a printed PDF (AC-19, AC-20, AC-21) · walked in a real browser at 360 and 1280 pixels against three existing test bookings (Confirmed, Cancelled and refunded, Not booked), the fragment handoff, and a one page A4 PDF; the 8 at once limit is proven in Postgres
- [ ] Verify it: `/check verify booking receipt & lookup`
- [x] Test it: `/test booking receipt & lookup` · 2026-10-04; 26 tests added (action edge answers, the checkout receipt view, the 30 day pin against the SQL, the `booking_lookup` allow list), `npm run check` green at 1195

### 19. Voucher codes · needs a decision
Owner level staff make discount codes, and checkout applies one when the customer enters it. Kept apart from checkout so the booking path ships first and the discount thickens it after.
**Done when:** an owner can create, pause and end a voucher (an amount or a percentage off, with an optional end date and use limit); a valid code at checkout shows the reduced total, an invalid or used up one says why; the server recomputes the discount on Confirm and counts the use in the same write; the receipt and the staff check both show the voucher and the amount taken off.
- [ ] Design it (spec): `/architect voucher codes`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Booking confirmation by email or text**: send the receipt and code when a booking is made and when staff confirm or turn it down. Needs a sending service, the same one self service password reset is waiting on · needs a decision · from slice 7
- **Customer cancel or move from the lookup page**: today a change goes through Messenger or a text to staff. Brings a refund and late cancel policy with it · needs a decision · from slice 7
- **Takings & unpaid report**: what came in over a date range and which bookings are still unpaid. The data is already recorded from spec 0002, only the view is missing · needs a decision · from spec 0002
- **Opening hours history**: a table recording every change to hours and courts, so a past day's utilisation uses the hours in force then. Spec 0008 uses today's hours for every day and says so on the page · needs a decision · from spec 0008
- **One off date exceptions for opening hours**: a public holiday, a tournament day, or a typhoon closure, as a table keyed by calendar date that wins over the weekday row. Staff close the courts with a closure booking today, which works but counts as open time on the usage report. Sits naturally beside `venue_hours` · needs a decision · from spec 0007
- **Bulk fill on the opening hours form**: a "copy Monday to all weekdays" helper, since five weekdays usually match and the form is now seven rows. Worth revisiting after Ella has used it a few times · from spec 0007
- **Custom dates on the usage report**: the report offers presets only. A from and to pair would drop into the same range resolver · from spec 0008
- **CSV of the day list**: the usage report downloads the numbers behind the charts, not the rows of a day · from spec 0008
- **Player self booking**: players sign in and book a cell themselves. The grid's Selected cell state is the seam it plugs into, and the data model needs one extra column. Brings accounts, customer cancellations and no shows with it. Guest booking with no account is slice 7 (features 16 to 19); signed in players stay here · needs a decision
- **Payments for court time**: taking payment in the app, as opposed to recording that it was paid, which the schedule already does. A GCash transfer with proof checked by staff is feature 16 and 17; a provider taking the money in the app stays here · needs a decision · GA
- **Automatic occupancy**: sensors or cameras that mark a court in use with no human input · needs a decision
- **Lobby display mode**: an always on screen at the venue · needs a decision
- **Free court alerts**: tell a player when a court opens up · needs a decision
- **Maintenance log**: net, surface, and lighting issues per court · needs a decision
- **More than one venue**: several locations under one system · needs a decision
- **Renaming the venue without a deploy**: the venue name is a constant, because `venue_settings` has no name column. Adding one is a small change to spec 0002 plus an owner only field · from spec 0003
- **Plain staff confirming payments**: spec 0016 lets only an owner, admin or superadmin decide. If checks pile up on shifts without a manager, let plain staff confirm (never turn down), which is one change inside `confirm_online_booking` · from spec 0016
- **Staff editing payments on a past booking**: today only an owner may touch a booking that has ended, so a payment settled the next day needs Ella · from spec 0002
- ~~**Grouping the rows of one multi court booking**~~: pulled into feature 16 on 2026-09-30, since one online booking code covers every picked slot. A class booked across two courts is two unrelated rows today, so cancelling it is two cancels · from spec 0005
- **Changing a booking's end time in the edit form**: today a booking edit changes details only, while a closure edit may also move its end. The same free run select would let a booking grow or shrink without cancel and rebook · from spec 0005
- **The staff board's now marker**: spec 0006 gives the public grid a `now` prop (dimmed past rows, a Now marker, scroll to the current hour). The staff board keeps its lock only dimming until it adopts the same prop, so the two boards read slightly differently on today until then · from spec 0006
- ~~**Closing at midnight**~~: resolved on 2026-09-15 by spec 0007, `closeTimeSchema` accepts `24:00` as an end · from spec 0005
- **Drag reorder for courts**: the settings page reorders with up and down buttons, fine at a handful of courts. Drag on a desktop would sit on top of the same `reorder_courts` function with a keyboard fallback, and needs a decision on the library · needs a decision · from spec 0007
- **Uptime monitoring**: PostHog only sees errors from a running app; a stopped container is silence. Spec 0001 asked for an external ping on `/api/health` from day one and spec 0009 skipped it on purpose. Better Stack's free tier posting to the same Discord channel is the ten minute answer once the host is known · from spec 0009
- **Source maps for browser errors**: `@posthog/nextjs-config` uploads them at build time but needs a personal API key inside the Docker build, so it waits for the hosting decision. Until then browser stack traces in PostHog are minified · from spec 0009
- **Audience numbers on the usage report**: Ella reads analytics in PostHog and court usage in `/staff/reports`. A small tile reading PostHog's query API server side would put them side by side · needs a decision · from spec 0009
- **Outside hours count in SQL**: saving opening hours counts the bookings left outside them in TypeScript over every active future booking. Fine at this venue's size; a venue ten times bigger should move the count into a SQL function · from spec 0007
- **Retention clock from the cancellation**: the phone purge counts 90 days from a booking's scheduled end, so a booking cancelled long before its date keeps the number longer than needed. One `least()` of `ends_at` and `cancelled_at` in the purge's `where` clause · from spec 0010
- **Purging the booking note too**: only the phone is cleared after 90 days. If notes turn out to carry personal details, the same function clears one more column · from spec 0010
- **Retention hint in the Book sheet**: one line under the phone field ("Kept 90 days after the booking") if staff want a script for what to tell customers · from spec 0010
- **A check that the purge ran**: `pg_cron` failures are invisible from the app. When uptime monitoring lands, add a check that `cron.job_run_details` shows a successful `purge_customer_phones` run in the last two days · from spec 0010
- **Direct Postgres for the staff path**: spec 0004 mints a Supabase token from the Better Auth session so every policy keeps working, which puts `SUPABASE_JWT_SECRET` in the app. Reading and writing over the same `pg` pool with `set local role authenticated` and the claims set per transaction removes that secret and the PostgREST hop, at the cost of moving six query and action modules off supabase-js. Worth doing with the Docker move · needs a decision · from spec 0004
- **Turnstile on the lookup page**: `/booking` is guarded only by the miss limit in Postgres (5 wrong codes per 15 minutes). If the `booking_lookup` event's `not_found` or `rate_limited` counts spike in the month after checkout goes live, add a Turnstile check once the limit trips · from spec 0017
- **Self service password reset by email**: today a forgotten password waits for an owner to make a reset link. Adding an email service (Resend or similar) would let Better Auth's own reset and emailed invites take over · needs a decision · from spec 0004

## Legend

**The decision box.** Every feature carries exactly one, the sub task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (before this workflow) and `dropped` (removed from scope, kept for history).
- **Approach tag** beside a heading (e.g. `· Facade`) overrides the project default for that feature; no tag inherits it.
- **Workflow tier tag** beside a heading (e.g. `· GA`) sets that one feature's rigor above or below the project default; no tag inherits the default.
- **Workflow** (header line) is the project default, what runs after `/develop`: **Prototype** = nothing (trust the build step's own self check); **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`. A feature built on a decision that was assumed rather than settled stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
