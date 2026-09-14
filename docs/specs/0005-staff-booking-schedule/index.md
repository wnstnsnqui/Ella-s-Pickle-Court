# 0005. Staff booking schedule

**Date**: 2026-09-13
**Status**: Accepted

## Summary

This is the screen staff use all day: the same court grid the public sees, at `/staff`, where every Available cell can be tapped. Staff tap the cells they want, on any court, then press Book or Close court once, fill in a short form in a sheet (a panel that slides up from the bottom of a phone or in from the side of a tablet), and the booking lands. Tapping a Booked cell shows who has it, lets you edit the details, or cancel with a confirmation. Every change is written by the Server Actions spec 0002 already built, the database still refuses a double booking, and the grid refetches itself whenever anything changes so nobody acts on a stale picture. No new tables. The work is a page, a selection bar, three sheets, a dialog, one new batch Server Action plus two small widenings of existing ones, a few new props on the grid and cell, and the live listener that carries the staff member's Clerk token.

## Requirements

**User stories**

- As a staff member at the desk, I want to take a booking in a few taps on my phone, so that the schedule keeps up with the customers in front of me.
- As a staff member, I want to see who has a court and whether they paid, so that I can answer a question without asking Ella.
- As a staff member, I want to close a court for a stretch of hours when the net breaks or a class comes in, so that players are not shown a court they cannot use.
- As a staff member, I want to fix a name, a note or a payment on a booking without cancelling it, so that a typo does not become a lost booking.
- As a staff member, I want to be told clearly when somebody else got the slot first, so that I can offer the customer the next one instead of arguing with an error.
- As Ella, I want the past to be editable only by me, so that yesterday's record stays honest.
- As the engineer, I want this screen to prove the whole thread (sign in, write, live update in a second browser) so that features 3 and 5 can close.

**Acceptance criteria** (the contract, each independently checkable)

- **AC-1**: The staff board lives at `/staff`. A signed out visitor asking for it is redirected to `/sign-in` by `proxy.ts` and returned to `/staff` after signing in. Sign in and sign up land on `/staff` by default, the staff menu carries a Schedule link, the wordmark still goes to `/`, and the page is marked `noindex`.
- **AC-2**: A signed in active staff member picks a day with the day navigation from spec 0003 (any past day, today, and forward up to `booking_horizon_days`) and sees every live court as a column with every cell labelled by the spec 0002 AC-5 rule. A Booked cell also shows the customer's name as one truncated line of visible text, on every viewport, through a new `caption` prop on `ScheduleCell`. A booking that spans several slots reads Booked on each of them and tapping any of them opens the same booking.
- **AC-3**: Tapping an Available cell adds it to a selection; tapping it again removes it. The selection may hold cells on any court and need not be contiguous. Selected cells show the Selected view from spec 0003, so `ScheduleGrid` takes a `selectedCells: ReadonlySet<string>` prop in place of the single `selectedCell`. While anything is selected a sticky bar above the bottom edge lists the selection as runs (court, start to end), and offers Book, Close court and Clear. Clear and the Escape key empty the selection. The selection is browser state only.
- **AC-4**: Book opens a sheet with customer name (required), phone (optional, loose validation: digits, spaces, plus and dashes, 7 to 30 characters), note (optional, up to 200 characters), payment status (Unpaid, Partial, Paid, Waived, default Unpaid) and an optional peso amount. Submitting creates one `booking` row per contiguous run per court, every row carrying the same customer fields, in one insert statement, so the set is all or nothing. On success the cells pass through Saving to Booked, a toast reads "Booked N hours on M courts" (the same count the bar showed), the selection empties and the sheet closes.
- **AC-5**: Close court opens a shorter sheet with only a note (optional) and creates one `closed` row per contiguous run per court by the same all or nothing rule. On success the cells read Unavailable.
- **AC-6**: When a set is refused because a slot was taken, the grid refetches the day at once, every selected cell that is no longer Available shows Change refused and leaves the selection, a toast says somebody got there first, and the cells still free stay selected with the sheet still open so the person can Book again. If no cell survives, the sheet closes. The refusal is never a raw database error.
- **AC-7**: Tapping a Booked cell opens a details sheet showing customer name, phone as a tap to call link, court, day and time range, note, payment status and amount in pesos, "Booked by <name> at <time>", and "Last changed by <name> at <time>" when that differs. It offers Edit and Cancel. Tapping an Unavailable cell caused by a closure opens the same sheet for the closure (note, who, when) with Edit and Reopen. Names come from `staff.display_name`, read as the whole `staff` table with no `is_active` filter, so a leaver still resolves.
- **AC-8**: Edit on a booking changes only name, phone, note, payment status and amount. Edit on a closure changes its note and its end time, chosen from the free run after its start on that court; the form sends `endTime` alone and the action rebuilds `ends_at` from the row's own date, which needs a branch in `updateReservationSchema` because today it refuses an end time without a date and start. Every save is conditional on the `version` read. When the row changed under the editor, the sheet reloads with the fresh values, says the booking changed while you were editing, keeps the typed values visible beside the fresh ones, and saving again writes against the new version.
- **AC-9**: Cancel and Reopen ask first in a dialog that names the row (customer, court, time, or the closure's court and time), with Keep as the safe choice. Confirming cancels the row through `cancelReservation`, the cells free at once, and a toast confirms.
- **AC-10**: The staff board listens on the private `schedule` topic through a browser client that carries the staff member's Clerk token, calls `realtime.setAuth()` again on every Clerk token refresh without rebuilding the socket, and on every broadcast refetches the whole day through `getStaffSchedule` rather than patching from the payload. Changed cells get the spec 0003 highlight, the live indicator reports the channel state, and writes stay allowed while the channel is not live because every write refetches the day on return. Whenever a refetch removes a cell from the selection, for any reason, the AC-6 toast fires, sheet open or not. If `realtime.setAuth()` throws, the error is logged, the channel keeps its current token, and the next Clerk refresh tries again.
- **AC-11**: For a `staff` role, a cell whose slot has already ended is rendered dimmed with a Lock icon (a new `locked` variant on `ScheduleCell`, and a `lockedCells: ReadonlySet<string>` prop on `ScheduleGrid` that skips selection for those keys by tap and by keyboard alike), keeps its label, and cannot join the selection, and the details sheet of a booking or closure that has ended shows "Ask Ella to change a past booking" in place of Edit, Cancel and Reopen. An `owner` sees the normal controls everywhere. Row level security stays the enforcement: a `forbidden` result from a stale tab is shown as a toast, never swallowed.
- **AC-12**: A signed in person whose `staff.is_active` is false gets no grid at `/staff`, only the switched off notice and sign out button from spec 0004. The page never calls `getStaffSchedule` for them.
- **AC-13**: A write in flight shows Saving on its cells. If the call fails to return at all (network error or a 10 second timeout), it is retried up to three times with a backoff of 1, 2 and 4 seconds. A retry that comes back `slot_taken` or `version_stale` after a silent success is resolved by the refetch that follows, which shows the change landed, and no error is shown. After the third failure the cells show Change refused and a toast offers Retry.
- **AC-14**: A day the venue is closed shows the spec 0003 empty state with nothing selectable. The day navigation stops at the horizon for everyone. A booking outside the current opening hours appears in its own out of hours row, can be opened and cancelled, and no new booking can be made there.
- **AC-15**: On a phone the sheets open from the bottom; from 768 pixels wide they open on the right so the grid stays beside the form. The grid keeps its spec 0003 keyboard model, Enter and Space on a focused cell toggle selection or open its details, the sticky bar and every sheet are reachable by keyboard, and every new surface meets WCAG 2.2 AA contrast in both themes. The legend shows all seven views.
- **AC-16**: The thread is proven end to end on a real Supabase project: a signed in staff member books a run and a second browser on the same day sees the cells turn Booked with no reload, the new rows carry `changed_by` equal to their Clerk id, and a second staff member booking one of the same cells at the same time is refused with the AC-6 message. This closes the last build task of feature 3 and the two live proofs feature 5 left open.

## Decision

**Chosen option**: Option 2: A selection bar over the spec 0003 grid, with sheets for the forms, and one new batch Server Action.

The staff board is a client layer on top of the grid that already exists: cells toggle in and out of a selection, a sticky bar turns the selection into one Book or Close court call, and the forms live in sheets built from the shadcn components spec 0003 shipped. One new Server Action, `createReservations`, writes a whole selection in one statement so the exclusion constraint refuses all of it or none of it. Editing and cancelling use the actions spec 0002 already built. A staff browser client, separate from the anonymous one, listens with the Clerk token and refetches the day on every broadcast.

**Implementation skills**: `react-hook-form` (`pproenca/dot-skills`, `.agents/skills/react-hook-form/`) · `zod` (`pproenca/dot-skills`, `.agents/skills/zod/`) · `shadcn` (`shadcn/ui`, `.agents/skills/shadcn/`) · `clerk-nextjs-patterns` (`clerk/skills`, `.agents/skills/clerk-nextjs-patterns/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`) · `tailwind-4-docs` (`lombiq/tailwind-agent-skills`, `.agents/skills/tailwind-4-docs/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Rationale

The reasoning, the options weighed, and a premise note about cross court selection: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**

No schema change. This feature reads and writes the tables spec 0002 built:

| Table | Used for | Notes |
| --- | --- | --- |
| `reservation` | every booking and closure | a selection becomes N rows, one per contiguous run per court, all with the same `customer_name`, `customer_phone`, `note`, `payment_status` and `amount`; nothing links the rows of one selection (see the group id follow up) |
| `court` | the columns | live rows only, ordered by `sort_order` |
| `venue_settings` | opening hours, slot length, horizon, timezone | read, never written here (feature 8 owns writing it) |
| `staff` | the names in the details sheet, and the viewer's role | `display_name` and `role`; active staff may already read the whole list by policy |

Browser only state, never persisted:

| State | Shape | Notes |
| --- | --- | --- |
| selection | `Set<cellKey>` where `cellKey` is `courtId@rowStartsAt` from `components/schedule/cell-key.ts` | pruned on every refetch to cells still Available and not locked |
| runs | derived from the selection: group by court, sort by row start, split where the next row does not start at the previous row's end | the shape the bar lists and the batch action receives |
| open sheet | `none` · `book` · `close` · `details(reservationId)` · `edit(reservationId)` | one sheet at a time |
| pending, failed, changed cells | `Set<cellKey>` each | the spec 0003 Saving, Failed and highlight views |

**State transitions**

The selection and the sheet, in the browser:

```
empty ──tap Available cell──▶ selecting ──Book / Close court──▶ sheet open
selecting ──tap selected cell (last one) / Clear / Escape──▶ empty
sheet open ──submit ok──▶ saving ──refetch──▶ empty
sheet open ──slot_taken──▶ refetch, prune ──▶ selecting (survivors) or empty
sheet open ──dismiss──▶ selecting (selection kept)
```

A reservation itself keeps the one transition spec 0002 fixed: `active` to `cancelled`, one way. Reopen is a cancel of a `closed` row.

**API surface**

All writes are Server Actions. Each calls `requireStaff()` first, validates with Zod, then writes.

| Action | Key inputs | Key outputs | Auth | Key errors |
| --- | --- | --- | --- | --- |
| `getStaffSchedule` (extended) | `date: string` (opt, defaults to today in `venue_settings.timezone`) | the day as today, plus `staff: { clerkUserId, displayName }[]` for every staff row, active or not | active staff | `403` not active staff, `422` bad date |
| `createReservations` (new) | `runs: { courtId, date, startTime, endTime }[]` (req, 1 to 20, `HH:mm` local, no two runs overlapping on the same court), `kind` (req), `customerName` (req when `kind` is `booking`), `customerPhone` (opt), `note` (opt), `paymentStatus` (opt, default `unpaid`), `amount` (opt) | the created rows | active staff, `owner` for a run that has already ended | `409` `slot_taken` (the whole set is refused), `403` not staff or a past run by a non owner, `422` invalid input |
| `updateReservation` (existing, schema widened) | `id`, `version`, and for a booking only `customerName`, `customerPhone`, `note`, `paymentStatus`, `amount`; for a closure only `note` and `endTime`, where `endTime` alone is accepted and `ends_at` is rebuilt from the stored row's date in `venue_settings.timezone` | the updated row | active staff, `owner` for one already ended | `409` `version_stale` or `slot_taken`, `403`, `404`, `422` end not after the stored start |
| `cancelReservation` (existing) | `id`, `version` | the cancelled row | active staff, `owner` for one already ended | `409` `version_stale`, `403`, `404` |
| realtime `schedule` topic (existing) | the Clerk token, applied with `realtime.setAuth()` | a broadcast per reservation change | `anon` or `authenticated`, by the `realtime.messages` policy | channel leaves `SUBSCRIBED`, handled by the spec 0003 indicator |

Rules the build follows:

- **`createReservations` is one `insert` of an array.** supabase-js sends a multi row insert as one statement, and Postgres applies the exclusion constraint to the statement as a whole, so a clash on any row rolls back every row. No transaction wrapper and no database function is needed.
- **The client sends runs, not cells.** Turning a selection into runs is a pure function in `lib/schedule/selection.ts` (group by court, sort, split on gaps), unit tested. The action re validates that the runs do not overlap each other, because the network sends whatever it likes.
- **Retries are safe by construction.** Every write is guarded, by the exclusion constraint or by `version`, so a retry after a silent success cannot act twice. The client retries only when no typed result came back at all (a thrown network error or a 10 second timeout), never on a typed `conflict` or `forbidden`.
- **Every write is followed by a refetch of the day**, whether or not a broadcast also arrives. The broadcast is the fast path for other tabs; the refetch after your own write is what makes the screen honest when the channel is down.
- **Sheets never patch grid state.** The details and edit sheets read their row from the latest refetched schedule by id; when a refetch no longer contains that id (cancelled elsewhere), the sheet closes with a toast.

**Value sourcing**

| Action | Value produced or displayed | Source |
| --- | --- | --- |
| page `/staff` | whether to render the grid, the notice, or redirect | `currentStaff()` from spec 0004: `signed-out` never reaches the page (proxy), `inactive` renders the notice, `unavailable` renders the 0004 could not load notice, `active` renders the grid |
| page `/staff` | the viewer's role for the lock rule | `staff.role` through `currentStaff()`, passed to the client layer as a prop |
| page `/staff` | the date shown | the `?date=` search parameter, defaulting to today in `venue_settings.timezone`, exactly as spec 0003's day navigation already does |
| grid | each cell's label and out of hours flag | `buildGrid()` from spec 0002, fed by `getStaffSchedule` |
| grid | the customer name on a Booked cell | `customer_name` of the active `booking` row overlapping the cell, found through `GridCell.blocks`, truncated to one line by CSS |
| grid | whether a cell is locked | derived: `row.endsAt <= now` (client clock, refreshed each minute) and `viewer.role !== 'owner'`. The database decides the real answer with `now()`; the client lock only avoids a tap that would be refused |
| selection bar | the runs and their labels | derived from the selection by `lib/schedule/selection.ts`; each run's `startTime` is the first row's `label`, its `endTime` is the last row's `endsAt` formatted in `venue_settings.timezone` with `formatAtVenue`; the court name from `grid.courts` |
| selection bar | the count in "Book 3 hours on 2 courts" | derived: sum of run lengths and number of distinct courts |
| `createReservations` | `starts_at` and `ends_at` in UTC | the run's `date`, `startTime` and `endTime` converted with `zonedTimeToUtc` and `venue_settings.timezone`, the same rule as `createReservation` in spec 0002 |
| `createReservations` | `kind` | which button was pressed: Book sends `booking`, Close court sends `closed` |
| `createReservations` | the customer fields on every row | the one form, copied to each row |
| `createReservations` | `created_by`, `changed_by`, `version` | the database defaults and the Clerk `sub` claim, per spec 0002 |
| refused set | which cells to mark Change refused | derived after the refetch: the selection intersected with cells whose state is no longer `available` |
| details sheet | the row shown | `getStaffSchedule().reservations` by id, the id taken from `GridCell.blocks` |
| details sheet | "Booked by <name> at <time>" | `created_by` resolved against the `staff` list returned by `getStaffSchedule`; `created_at` formatted in `venue_settings.timezone`. An id with no staff row (should not happen, the foreign key forbids it) shows "a staff member" |
| details sheet | "Last changed by" | `changed_by` and `updated_at` the same way, shown only when `updated_at` differs from `created_at` |
| details sheet | the phone as a link | `customer_phone` with everything but digits and a leading plus stripped, in a `tel:` link; the text stays as typed |
| details sheet | the amount | `amount` formatted as PHP with two decimals, `Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })`; currency fixed by spec 0002 |
| details sheet | whether Edit and Cancel show | derived: `ends_at > now` or `viewer.role === 'owner'` |
| closure edit | the end time options | derived: every row end on that court after the closure's start, up to the first cell that is Booked by a different reservation or the closing time |
| `updateReservation` | which fields the edit form sends | a booking sends only the five detail fields; a closure sends only `note` and `endTime`; the form never sends `courtId`, `date` or `startTime` |
| stale edit | the fresh values and the typed values | the fresh row from the refetch triggered by `version_stale`; the typed values from the form state, shown read only beside each changed field |
| retry | when to retry | a thrown error or a 10 second timeout with no typed result; not a typed `conflict`, `forbidden` or `invalid` |
| realtime | the token for the private channel | `useAuth().getToken()` from Clerk on the client, applied with `realtime.setAuth()` before `subscribe()` and again whenever Clerk hands out a new token |
| live indicator | live or not, and the age | the channel status and the client clock at the last refetch, per spec 0003 |
| toasts | the wording of the refused message, and of a selection pruned by any refetch | fixed copy: "Somebody got there first. The taken hours were cleared from your selection." |
| toasts | the wording of the success message | fixed copy: "Booked N hours on M courts" (or "Closed N hours on M courts"), N and M derived as for the bar |
| grid | which cells are locked, as a prop | derived on the client from `row.endsAt`, the minute ticking clock and `viewer.role`, passed to `ScheduleGrid` as `lockedCells` |
| `updateReservation` | `ends_at` for a closure edit sending `endTime` alone | the stored row's `starts_at` read back to a venue local date with `calendarDateInZone`, combined with `endTime` through `zonedTimeToUtc` |
| after sign in | where the person lands | `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` and the sign up twin, set to `/staff`; a redirect from the proxy still wins and returns to the page asked for |

**Key invariants**

1. No two active reservations overlap on a court. Enforced by `reservation_no_overlap` in spec 0002; this screen never assumes its own picture is current.
2. A selection is written in one statement or not at all. `createReservations` never loops single inserts.
3. Every write is conditional on `version` and records `changed_by`, through the existing actions.
4. Every write is followed by a refetch of the whole day. The client never patches a cell from a payload or from its own optimism beyond the Saving view.
5. The selection holds only cells that are Available and not locked in the latest schedule. Every refetch prunes it, and a prune that removes anything tells the person with the AC-6 toast.
6. The staff browser client and the anonymous browser client are two modules and two instances. The anonymous one never receives a token; the staff one is created only under `/staff`.
7. Nothing on `/staff` is cached or statically rendered. The page renders per request, like every board.
8. The lock for past slots and the hidden Edit for past rows are conveniences. The `staff` update and insert policies in spec 0002 are the enforcement.
9. Retries happen only when no typed result arrived, at most three times.

**Security model**

- `/staff(.*)` is matched in `proxy.ts` with `createRouteMatcher` and guarded by `auth.protect()`, so no response with customer data is ever built for a signed out visitor. This is the second protected surface after nothing; the sign in pages stay public.
- The page is a Server Component that calls `currentStaff()` and, only for an active staff member, `getStaffSchedule` with `staffSupabase()`. An inactive or unavailable staff state renders the spec 0004 notices and no grid.
- Every write goes through the Server Actions, which call `requireStaff()` then validate with Zod. Row level security from spec 0002 decides who may write what: active staff for rows ending after now, owner for the rest.
- The realtime listener joins the private `schedule` topic. The broadcast payload carries no personal data (spec 0002 narrowed it), so the token adds nothing to what the listener may see today; it is applied anyway so the staff connection is authenticated the day something staff only is broadcast, per spec 0001 rule 12.
- The staff browser client never writes. It exists only to listen. Every write is a Server Action over HTTP.
- `/staff` is `noindex`, like the sign in pages.
- Regulated data: none. `customer_name` and `customer_phone` are ordinary personal data and appear only on this signed in page and in its Server Action responses.

**Configuration required**

- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`: change from `/` to `/staff` in `.env.example` and every environment, so sign in lands on the schedule.
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`: the same, for the first sign in from an invitation.

No new secrets. No new Supabase settings; the `realtime.messages` policy for `authenticated` on the `schedule` topic already exists from spec 0002.

**Critical test scenarios**

- Happy path: staff select 4pm and 5pm on court 1 and 4pm on court 2, press Book, enter a name, and three cells turn Booked in this browser and in a second one with no reload; two rows exist with `changed_by` set, verifies **AC-3**, **AC-4**, **AC-10**, **AC-16**.
- Failure case: two staff members book the same cell within the same second; one succeeds, the other sees Change refused on that cell, the toast, and their other cells still selected, and exactly one row exists, verifies **AC-6**, **AC-16**.
- Failure case: a selection of two runs where the second clashes; zero rows are inserted, verifies **AC-4**.
- Failure case: editing a booking whose version moved; the sheet shows the fresh values with the typed values beside them, and saving again succeeds, verifies **AC-8**.
- Failure case: the network drops mid write; the cells show Saving, the action is retried, and a retry that returns `slot_taken` because the first attempt actually landed ends with the cells Booked and no error, verifies **AC-13**.
- Auth and permission: a signed out visitor to `/staff` is redirected to `/sign-in` and back; an inactive staff member sees the notice and no grid; a `staff` role cannot select a slot that has ended and sees Ask Ella on a past booking, while an `owner` can edit it, verifies **AC-1**, **AC-11**, **AC-12**.
- Selection: `lib/schedule/selection.ts` turns a scattered set across two courts into the right runs, splits on a gap, and drops cells that a refetch made Booked, verifies **AC-3**, **AC-6**.
- Closure: a closure created over three hours reads Unavailable, opens to a sheet with Edit and Reopen, its end time can be shortened, and Reopen frees the cells after the dialog, verifies **AC-5**, **AC-7**, **AC-8**, **AC-9**.
- Live: a token refresh from Clerk calls `realtime.setAuth()` and the channel stays `SUBSCRIBED`; a broadcast while cells are selected prunes the taken ones with a toast, verifies **AC-10**.
- Bounds and presentation: a closed day shows the empty state with nothing selectable, an out of hours booking can be opened and cancelled but not created, sheets open at the bottom on 375 pixels and on the right at 768, and the new surfaces pass the contrast audit in both themes, verifies **AC-14**, **AC-15**.

## Build plan

Tracer Bullet, so the first slice is the thinnest real thread: the protected page, a single cell selected, one booking written, seen live in a second browser. That thread is the proof features 3 and 5 are waiting on, so it goes first and everything else thickens around it.

1. [x] Protect and land: add `/staff(.*)` to `proxy.ts` with `createRouteMatcher` and `auth.protect()`, create `app/staff/page.tsx` as a per request Server Component that branches on `currentStaff()` (notice for inactive or unavailable, grid for active), mark it `noindex`, add the Schedule link to the staff menu, and change the two Clerk fallback redirect URLs to `/staff`, satisfies **AC-1**, **AC-12**.
2. [x] Extend `getStaffSchedule` to return the staff list (`clerkUserId`, `displayName`) alongside the day, satisfies **AC-7**.
3. [x] Add `createReservations` in `lib/schedule/actions.ts` with its Zod schema (1 to 20 runs, no overlapping runs on one court, the customer rules from `createReservationSchema`), one array insert, and the same `23P01` to `slot_taken` mapping, satisfies **AC-4**, **AC-5**, **AC-6**.
4. [x] Build `lib/schedule/selection.ts`: toggle, prune against a grid, and the runs derivation (group by court, sort, split on gaps), pure and unit tested. Widen `ScheduleGrid` from `selectedCell` to `selectedCells: ReadonlySet<string>` and update the design page and tests that use it, satisfies **AC-3**, **AC-6**.
5. [x] The thin thread: a `StaffBoard` client component that renders `ScheduleGrid` with `onSelectCell` toggling the selection, the sticky bar with Book, Close court and Clear, and a minimal Book sheet (name only for now) that calls `createReservations`, shows Saving, refetches the day, and toasts. Prove it: one cell booked from a phone shows Booked in a second browser after a refresh (the no reload version is step 6) and `changed_by` holds the Clerk id, satisfies **AC-3**, **AC-4**, **AC-16**. _Proven on 2026-09-14 with Playwright: a two run booking landed with `changed_by` set, and a second signed in browser showed the cells Booked with no reload (see `verify.md`)._
6. [x] The staff listener: `lib/supabase/staff-browser.ts` (a second memoised client, token applied with `realtime.setAuth()`), a `useStaffSchedule` hook that subscribes to `schedule`, re applies the token on every Clerk refresh, refetches the day on every broadcast, prunes the selection with the toast, and feeds the live indicator and the changed cell highlight, satisfies **AC-10**.
7. [x] Thicken the forms: add the shadcn `form`, `label` and `textarea` components, install `react-hook-form` and `@hookform/resolvers`, and build the full Book sheet (name, phone, note, payment status, amount) and the Close court sheet (note), both resolving the existing Zod schemas and surfacing action issues per field; sheet side by a `matchMedia` hook at 768 pixels, satisfies **AC-4**, **AC-5**, **AC-15**.
8. [x] The refused path: on `slot_taken` refetch, mark the taken cells Change refused, prune, keep the survivors and the sheet, close when nothing survives, satisfies **AC-6**.
9. [x] Details, edit and cancel: the details sheet for bookings and closures (names from the staff list, tap to call, PHP amount, booked by and last changed by), the edit form for details or for note plus end time, the `updateReservationSchema` branch that accepts `endTime` alone for a closure and the action rebuilding `ends_at` from the stored date, the stale version reload that keeps typed values visible, and the confirm dialog wired to `cancelReservation`, satisfies **AC-7**, **AC-8**, **AC-9**.
10. [x] Past and role: the `caption` prop on `ScheduleCell` carrying the customer name, the `locked` cell variant with its Lock icon and the `lockedCells` prop on `ScheduleGrid`, the lock for ended slots under a `staff` role with a minute ticking clock, Ask Ella in the details sheet, owner sees everything, and `forbidden` surfaced as a toast, satisfies **AC-2**, **AC-11**.
11. [x] Retries and bounds: the 10 second timeout with three backed off retries and the Retry toast, the closed day empty state, the horizon stop, the out of hours row rules, and Escape clearing the selection, satisfies **AC-13**, **AC-14**, **AC-3**.
12. [x] Finish: legend with all seven views, keyboard pass on the bar and sheets, contrast check of the new surfaces on `/design` in both themes, and the concurrent double booking proof with two signed in staff members, satisfies **AC-15**, **AC-16**. _Done 2026-09-14: seven view legend, keyboard pass (arrows, Enter, Tab to the bar, sheets, Escape with focus returned), 60 of 60 token pairs at AA on `/design`, and the concurrent double booking proof (one row, the loser sees Change refused). The race ran with one account in two browsers; a second staff account would make it exact._

## Consequences

**Positive**

- The desk gets a booking in about four taps: cells, Book, a name, done. Closing a court is the same gesture with a different button.
- A class across two courts is one form, one statement, and either all of it lands or none of it does. There is never a half made booking to clean up.
- Nothing new in the database. Every guarantee spec 0002 made (no overlaps, versions, audit rows, no personal data to anon) holds here without a line of new SQL.
- The grid can never lie for long: every write refetches, every broadcast refetches, and the selection is pruned against reality each time.
- Retries are safe because the writes are guarded, so a bad wifi day at the venue means a slower tap, not a double closure.
- This screen closes the loop for features 3 and 5, so three scope rows can move at once.

**Negative and tradeoffs**

- **The rows of one multi court booking are unrelated in the database.** Cancelling a class booked on two courts is two cancels, and reporting sees two bookings. A `booking_group` column would fix it and is a small migration to spec 0002 if it bites.
- **A scattered selection is a power feature with a learning cost.** Somebody who taps two cells with a gap between them gets two bookings, which is right, but the bar has to make that visible ("2 bookings") or the desk will be surprised.
- **Bookings cannot be moved.** Changing a time or a court is cancel and rebook, on purpose, so the audit reads honestly and the edit form stays simple. The action already supports moving, so widening this later is UI work only.
- **Closures may be extended in the edit form but bookings may not.** A small asymmetry you chose: a closure outliving a repair is common, a booking growing is rarer and usually a new customer decision. Worth revisiting after the first weeks.
- **react-hook-form is a new dependency** for a product with three forms. The zod resolver keeps one set of rules, but the shadcn `Form` wiring and the skill's rules are one more thing to hold in your head. `useActionState` would have done the job with nothing installed.
- **The client lock uses the browser's clock.** A phone with a wrong clock may lock a slot early or late by that error; the database still decides with `now()`, so the worst case is a `forbidden` toast.
- **A booking ending at midnight cannot be created.** `localTimeSchema` stops at `23:59`, which matches the seeded hours (last close 23:00) but not a close at midnight. Noted for spec 0002 below.

**Neutral**

- Two browser Supabase clients exist now: anonymous for the public board and token carrying for the staff board, in two files, never merged.
- The Server Action layer gains one function. The rest of this feature is components and hooks.
- The Selected, Saving and Failed views spec 0003 built without a consumer now have one.
- Sign in lands on `/staff` instead of `/`. Players are never asked to sign in, so this changes nothing for them.

## Follow-up

- [ ] `react-hook-form` was installed during this design and is not yet in root `AGENTS.md` `## Agent skills`. It shapes every form in the project, so it belongs at root, one bullet with its path; `/sync` owns the edit.
- [ ] Add `react-hook-form` and `@hookform/resolvers` to `package.json` in build step 7; spec 0001's dependency list should gain them when it is next touched.
- [ ] Decide whether the rows of one multi court booking should share a `booking_group` id so they can be cancelled and reported together. A small, forward only migration on `reservation` under spec 0002 if wanted.
- [ ] Decide whether booking edits may change the end time, matching closures. Cheap to add: the same free run select the closure edit uses.
- [ ] `localTimeSchema` in spec 0002 cannot express a `24:00` end. If Ella ever sets a closing time of midnight, the last slot becomes unbookable; fix in spec 0002 by accepting `24:00` for `endTime` only.
- [ ] Feature 7, the public board, should reuse `useStaffSchedule` minus the token as its listener, or share a base hook, rather than writing a second subscription.
- [ ] When this feature closes, tick the last build task of feature 3 and the two live proofs of feature 5 in the scope, and note feature 1's deferred "two tab version conflict as seen by a person" check as done.
