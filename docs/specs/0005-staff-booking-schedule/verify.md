# Verify: Staff booking schedule · spec 0005 · updated 2026-09-14 (run 5, Playwright against a signed in Chrome profile, plus the phone and second account steps done by hand on 2026-09-14)

_Steps derived from spec 0005 acceptance criteria and its value sourcing table. `/check verify` runs these; `/test` locks the durable ones. Everything below needs a real Supabase project and a Clerk sign in, so it runs in a browser against `npm run dev`._

## UI / manual

- [x] Signed out, open `/staff` → redirected to `/sign-in?redirect_url=…/staff`; sign in → land back on `/staff` → AC-1
- [x] Sign in from `/sign-in` with no `redirect_url` → land on `/staff`; the staff menu shows a Schedule link; the wordmark still goes to `/`; the page source carries `noindex` → AC-1
- [x] Sign in as an account whose `staff.is_active` is false → the switched off notice and sign out, no grid, and no `getStaffSchedule` call in the server log → AC-12
- [x] Use the day arrows: yesterday opens, today opens, the arrow stops at `booking_horizon_days` ahead; `?date=2026-13-40` shows the could not be shown notice with a Back to today link → AC-2, AC-14
- [x] With a booking on the day, its cells read Booked with the customer's name under the icon, truncated on a phone width; a two hour booking reads Booked on both cells and tapping either opens the same details sheet → AC-2
- [x] Tap an Available cell → Selected; tap again → Available; select cells on two courts with a gap on one → the bar lists three runs and says "N hours on 2 courts · 3 bookings"; Clear empties it; Escape empties it → AC-3
- [x] Book → the sheet opens from the bottom at 375px and from the right at 768px; name empty → refused inline; phone `abc` → refused inline, `+63 917 123 4567` accepted; note over 200 characters is cut → AC-4, AC-15
- [x] Book two runs on two courts under one name → cells pass through Saving to Booked, the toast reads "Booked N hours on M courts" matching the bar, the selection empties, the sheet closes; in the database exactly one row per run, all with the same customer fields → AC-4
- [x] Close court on a run with a note → the cells read Unavailable, the toast reads "Closed …"; a `closed` row exists per run → AC-5
- [x] In a second browser signed in as another staff member, book one of the cells the first browser has selected, then Book in the first → the taken cell shows Change refused and leaves the selection, the toast says somebody got there first, the other cells stay Selected with the sheet still open, and Book again lands them; no raw database error anywhere → AC-6, AC-16
- [x] Repeat with the whole selection taken → the sheet closes → AC-6
- [x] Tap a Booked cell → the sheet shows name, phone as a `tel:` link (only digits and a leading plus in the href), court, day and time range, note, payment status and the amount as `₱1,234.00`, "Booked by <name> at <time>"; edit it → "Last changed by" appears and differs → AC-7
- [x] Tap an Unavailable cell caused by a closure → the closure sheet with note, who and when, and Edit and Reopen; tap an Unavailable cell outside opening hours → nothing opens → AC-7
- [x] Switch a staff row's `is_active` to false in the SQL editor → their name still shows on the bookings they made → AC-7
- [x] Edit a booking: change name, phone, note, payment and amount → saved, the details sheet shows the new values; the row's `version` moved by one and `changed_by` is your Clerk id → AC-8
- [x] Edit a closure: the end time list offers every slot end after its start up to the first booked slot or closing time; pick a later end → the extra cells read Unavailable; pick an earlier one → they free → AC-8
- [x] Open Edit in two browsers on the same booking; save in the second, then save in the first → the first sheet says it changed while you were editing, shows "Now: …" under each differing field with your typed values still in the boxes; save again → it lands against the new version → AC-8
- [x] Cancel on a booking → a dialog naming the customer, court and time, with Keep focused first; Keep does nothing; confirm → the cells free at once and a toast confirms; the row is `cancelled`, not deleted → AC-9
- [x] Reopen on a closure → the same dialog naming the court and time; confirm → the cells read Available → AC-9
- [x] With two browsers on the same day, book in one → the other's cells turn Booked with no reload and glow briefly; the indicator reads Live; kill the network on one → Reconnecting, then Not live with an age; restore → Live and the grid catches up → AC-10, AC-16
- [x] Leave the board open for 5 minutes (past Clerk's token life), then book → it lands, and the second browser still receives the broadcast (no `realtime.setAuth()` error in the console) → AC-10
- [x] While cells are selected, have the second browser book one of them → the first prunes it with the AC-6 toast, whether or not a sheet is open → AC-10
- [x] As a `staff` role, look at a slot that has ended → dimmed with a lock icon, label kept, tapping or pressing Enter does not select it; open a past booking → "Ask Ella to change a past booking" instead of Edit and Cancel; as the `owner` the same slots are selectable and the buttons show → AC-11
- [x] As `staff`, edit a past booking through a stale tab (open the sheet before the hour ends, save after) → a forbidden toast, never a silent failure → AC-11
- [x] Throttle the network to offline, press Book → the cells read Saving, the request retries at 1, 2 and 4 seconds (network tab), then the cells read Change refused and a toast offers Retry; go online, Retry → lands → AC-13
- [x] Set the venue closed for the day (open = close in `venue_settings`) → the Closed all day empty state with nothing selectable → AC-14
- [x] Shorten the opening hours under an existing booking → it appears in its own out of hours row, opens, can be cancelled, and no cell in that row can be selected → AC-14
- [x] Tab into the grid, arrow to a cell, Enter selects it, Tab reaches the bar's Book, Enter opens the sheet, Tab walks every field and the submit, Escape closes it and returns focus → AC-15
- [x] The legend above the staff grid shows all seven views → AC-15
- [x] At 375px wide, the brand band holds the wordmark, the Schedule, account and sign out icons and the theme button with nothing past the edge; each icon has a title, and the labels return from 640px → AC-1, AC-15
- [x] After the third failed retry the sheet closes, the selection stays, and the toast's Retry is tappable on a phone and lands the booking with what was typed → AC-13
- [x] Two staff members press Book on the same cell within the same second → exactly one row exists, the loser sees Change refused and the toast → AC-16

## Commands

- [x] `npm run check` → lint, format, typecheck and 193 tests green → AC-3, AC-4, AC-6, AC-8, AC-12, AC-13
- [x] `npm run build` → `/staff` listed as `ƒ (Dynamic)` → invariant 7
- [x] `select id, court_id, starts_at, ends_at, kind, customer_name, created_by, changed_by from reservation order by id desc limit 5;` after a two run booking → both rows carry the same customer fields and your Clerk id → AC-4, AC-16

## Value sourcing checks

- [x] `/staff` with no `?date=` at 23:30 Manila on a machine set to UTC → today is the Manila day, not the UTC one → page date source
- [x] A booking made at 4pm Manila stores `starts_at` at `08:00Z` → `createReservations` instants
- [x] The bar's end time for a run ending at the last slot equals the closing time in the grid's own labels → selection bar run labels
- [x] A booking made by a leaver shows their name, a `created_by` with no staff row shows "a staff member" → details sheet names
- [x] An amount of `250.5` shows as `₱250.50` → details sheet amount
- [x] A closure edit sending only `endTime` keeps the row on its own date when the tab has moved to another day → `updateReservation` end rebuild · not reachable from the UI (the sheet only opens from the closure's own day); the action rebuilds `ends_at` from the stored row, checked by SQL
- [x] A cell that a retry actually landed (kill the connection after the request is sent) ends Booked with the success toast, not the refused toast → retry resolution

## Acceptance-criteria coverage

- AC-1 steps 1, 2 · AC-2 steps 4, 5 · AC-3 step 6 · AC-4 steps 7, 8 · AC-5 step 9 · AC-6 steps 10, 11 · AC-7 steps 12, 13, 14 · AC-8 steps 15, 16, 17 · AC-9 steps 18, 19 · AC-10 steps 20, 21, 22 · AC-11 steps 23, 24 · AC-12 step 3 · AC-13 step 25 · AC-14 steps 4, 26, 27 · AC-15 steps 7, 28, 29 · AC-16 steps 10, 20, 30
