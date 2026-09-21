# Scope: Ella's Picklecourt Court Monitor

A court booking schedule for Ella's Picklecourt. Pick a day and see time down the side and a column per court, with every cell reading Booked, Available or Unavailable. Staff keep it, players read it before they come, and Ella can look back at how the courts were used.

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
- [ ] Build it: `/develop data model`
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
spec [0006](../specs/0006-public-schedule-board/index.md) · code in `app/page.tsx`, `app/loading.tsx`, `app/api/schedule/`, `components/board/`, `components/board-notice.tsx`, `components/schedule/read-gate.ts`, `components/schedule/use-schedule-channel.ts`, `lib/rate-limit.ts`, `proxy.ts`; the calendar date picker (spec [0011](../specs/0011-calendar-date-picker/index.md)) folds in here too, code in `components/day-nav.tsx`, `components/date-picker.tsx`, `components/board-sheet.tsx`, `components/use-media-query.ts`, `components/ui/calendar.tsx`, `components/ui/popover.tsx`
- [x] Design it (spec): `/architect public schedule board`
- [x] Build it: `/develop public schedule board`
  - [x] The thin thread: `/` becomes the board on `getSchedule()` with the day range rule, the notice, the empty, error and loading states, and `GET /api/schedule`, proven against a staff booking after a reload (AC-1, AC-2, AC-12)
  - [x] Live: the base listener hook extracted from the staff board, the public hook on the anonymous client, one booking seen in a signed out browser with no reload, and the privacy proof over the JSON and the HTML (AC-5, AC-7, AC-13)
  - [x] Honest when not live: the slow poll, the focus refetch, the 429 wait, and the board following the venue's day at midnight (AC-6, AC-9, AC-10)
  - [x] The limiter in `proxy.ts` with its tests (AC-8)
  - [x] The phone conveniences and the metadata: the next free strip, dimmed past hours, the now marker and scroll, the per day title, the canonical link and the JSON-LD block (AC-3, AC-4, AC-11)
  - [x] Calendar date picker (spec 0011): the `Pick a date` button on `DayNav` opening a shadcn `Calendar` inside the promoted, shared `BoardSheet`, bounded to the booking window and the staff/public past rule, on both boards; `BoardSheet`/`useMediaQuery` promoted out of `components/staff/` (spec 0011, all ACs)
- [ ] Verify it: `/check verify public schedule board`
- [ ] Test it: `/test public schedule board`

## Slice 2: Manage the courts

### 8. Courts & opening hours · done
Add a court, rename it, reorder it, retire it, and change the hours the venue is open, without touching the database by hand. Owner only, because these change what everyone else sees.
**Done when:** an owner can add, rename, reorder, and retire a court, and can change the weekday and weekend opening hours, the slot length, and how far ahead staff may book. Retiring a court that still has future bookings is refused and says how many are in the way. Both boards reflect every change straight away.
spec [0007](../specs/0007-courts-opening-hours/index.md) · code in `app/staff/settings/`, `components/settings/`, `components/staff-menu.tsx`, `components/schedule/use-schedule-channel.ts`, `lib/schedule/actions.ts`, `lib/schedule/queries.ts`, `lib/schedule/schemas.ts`, `lib/schedule/outside-hours.ts`, `lib/time.ts`, `supabase/migrations/20260915044956_courts_opening_hours.sql`
- [x] Design it (spec): `/architect courts & opening hours`
- [x] Build it: `/develop courts & opening hours`
  - [x] The migration and the thin thread: the unique name index, the widened sort order check, the midnight check, `reorder_courts`, the shared broadcast trigger, the listener learning two events, `getOwnerSettings()`, the owner only `/staff/settings` page with its menu link and skeleton, and Add court proven live in a second browser (AC-1, AC-2, AC-3, AC-4, AC-5, AC-8, AC-11)
  - [x] The court list in full: rename with the name clash on the field, the optimistic reorder with locked controls, retire through the confirm dialog with the count, and the retired disclosure with Restore (AC-4, AC-5, AC-6, AC-7, AC-13)
  - [x] Opening hours: `24:00` as a close time through the schema, the grid math and the labels, the form with dirty tracking, and the two step save that warns with the count of bookings left outside the hours (AC-8, AC-9, AC-10, AC-13)
  - [x] Finish: the out of range day on both boards, keyboard, names and contrast, and the full live proof on the real project (AC-12, AC-14, AC-15)
- [x] Verify it: `/check verify courts & opening hours` (skipped on 2026-09-15; the live owner walkthrough in `verify.md` was not run, marked done by the engineer)
- [x] Test it: `/test courts & opening hours` (skipped on 2026-09-15; helper unit tests exist, no component or hook tests)

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

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Takings & unpaid report**: what came in over a date range and which bookings are still unpaid. The data is already recorded from spec 0002, only the view is missing · needs a decision · from spec 0002
- **Opening hours history**: a table recording every change to hours and courts, so a past day's utilisation uses the hours in force then. Spec 0008 uses today's hours for every day and says so on the page · needs a decision · from spec 0008
- **Custom dates on the usage report**: the report offers presets only. A from and to pair would drop into the same range resolver · from spec 0008
- **CSV of the day list**: the usage report downloads the numbers behind the charts, not the rows of a day · from spec 0008
- **Player self booking**: players sign in and book a cell themselves. The grid's Selected cell state is the seam it plugs into, and the data model needs one extra column. Brings accounts, customer cancellations and no shows with it · needs a decision
- **Payments for court time**: taking payment in the app, as opposed to recording that it was paid, which the schedule already does · needs a decision · GA
- **Automatic occupancy**: sensors or cameras that mark a court in use with no human input · needs a decision
- **Lobby display mode**: an always on screen at the venue · needs a decision
- **Free court alerts**: tell a player when a court opens up · needs a decision
- **Maintenance log**: net, surface, and lighting issues per court · needs a decision
- **More than one venue**: several locations under one system · needs a decision
- **Renaming the venue without a deploy**: the venue name is a constant, because `venue_settings` has no name column. Adding one is a small change to spec 0002 plus an owner only field · from spec 0003
- **Staff editing payments on a past booking**: today only an owner may touch a booking that has ended, so a payment settled the next day needs Ella · from spec 0002
- **Grouping the rows of one multi court booking**: a class booked across two courts is two unrelated rows today, so cancelling it is two cancels. A `booking_group` column on `reservation` is a small forward only migration under spec 0002 · from spec 0005
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
