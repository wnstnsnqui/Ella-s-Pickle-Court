# Verify: courts and opening hours · spec 0007 · updated 2026-09-15

_Steps derived from spec 0007 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones. Steps marked "(proven in the build)" were run on 2026-09-15 with the Supabase CLI, a headless browser on a sample data preview, and `npm run check`; run them again anyway. The live proof in a signed in owner browser was not run in the build, because the build had no owner credentials._

## UI / manual

- [ ] Open `/staff/settings` in a browser with no session → redirected to `/sign-in`, and after signing in as the owner you land back on `/staff/settings` → AC-1 (the redirect was proven in the build with curl)
- [ ] Sign in as a non owner staff account and open `/staff/settings` → you land on `/staff`; the staff menu shows Schedule but no Settings link → AC-1, AC-15
- [ ] Sign in as the owner → the staff menu shows a Settings link (icon only on a phone), and `/staff/settings` shows Courts, Opening hours, and, only when one exists, a collapsed Retired courts section; the page source carries `noindex` → AC-1, AC-2
- [ ] Throttle the network and open `/staff/settings` → a skeleton of the three sections shows while the read streams → AC-2
- [ ] Stop the Supabase project (or break the anon key) and open the page → an error notice with Try again; restore and press it → the page loads without a full reload → AC-2, value sourcing "what Retry does"
- [ ] Press Add court, type `Court 3` and a note, save → the sheet closes, `Court 3` is last in the list, a toast confirms; a signed out browser on `/` and a staff browser on `/staff` show the new column with no reload → AC-3, AC-11, AC-15
- [ ] Add a court named ` court 1 ` (spaces, lower case) while `Court 1` is live → the sheet stays open and the name field says another court has that name → AC-4, value sourcing "whether the name is taken"
- [ ] Retire `Court 1`, then add a new `Court 1` → allowed, because a retired court may share a name → AC-4, invariant 1
- [ ] Edit `Court 2`, change the name, save → the row updates, its position is unchanged, both boards show the new name with no reload → AC-4, AC-11
- [ ] Open Edit on a court in browser A; in browser B rename the same court and save; back in A save → A shows "This court changed while you were editing" with the fresh values loaded, and a second save writes → AC-4, AC-13
- [ ] Press Move up on the second court → it swaps at once, every arrow is disabled until the write returns, then stays swapped; both boards show the new column order with no reload → AC-5, AC-11
- [ ] With a screen reader, focus an arrow → it reads "Move Court 2 up"; after a move a polite announcement says "Court 2 moved to position 1 of 3" → AC-5
- [ ] The first row's Move up and the last row's Move down are disabled → AC-5
- [ ] Reorder in browser A while browser B holds an older list, then reorder in B → B's list reverts, reloads, and a toast says somebody else changed the settings → AC-5, AC-13
- [ ] Book two future hours on a court, then Retire it → the dialog stays open and says that court still has 2 bookings ahead of it; cancel both bookings and retire again → it succeeds, the court moves to Retired courts, a toast confirms, and both boards drop the column with no reload → AC-6, AC-11, value sourcing "the count of bookings in the way"
- [ ] Expand Retired courts → the button reports `aria-expanded`, each row shows the name and the retired date in venue time, and Restore is one tap that puts the court back on the boards → AC-7, AC-14
- [ ] Retire a court, add a new court (which takes its old order), then Restore the retired one → it comes back at the next free order → AC-7, value sourcing "the restored court's order"
- [ ] Opening hours: the open selects offer 12mn to 11:30pm and the close selects 12:30am to Midnight; Save hours is disabled until a field changes; Undo changes puts it back → AC-8
- [ ] Set the weekday close to Midnight and save → the staff and public grids on a weekday end with a row that finishes at midnight; book that last row → it saves, and a closure edited to end at Midnight saves too → AC-8, AC-10
- [ ] Set a close time earlier than its open → the close field shows the error and nothing is sent → AC-8
- [ ] With three future weekday bookings after 8pm, set the weekday close to 8pm and save → a dialog says 3 future bookings fall outside these hours; Keep editing leaves the form as typed and nothing is written; Save anyway writes and those bookings show on their own marked rows on the grid → AC-9
- [ ] Add a future closure outside the proposed hours and save the hours → not counted → AC-9
- [ ] Change the slot length to 30 minutes and save → both boards show half hour rows with no reload → AC-8, AC-11
- [ ] Open `/staff?date=` for a day 30 days out in one browser; set the booking horizon to 14 and save → that browser goes to today with a toast saying the day is no longer open for booking, no error state; the same on `/?date=` in a signed out browser → AC-12
- [ ] Save the hours in browser A; in browser B (holding the older version) change a field and save → B's form reloads with A's values and a toast says somebody else changed the settings → AC-13
- [ ] Demote the owner to `staff` in the `staff` table while the settings page is open, then save anything → a toast says the account is not allowed, never a silent no op → AC-13
- [ ] On a phone width the sheet and dialogs open from the bottom, from 768px wide the sheet opens from the right → AC-14 (proven in the build on a sample preview)
- [ ] Tab through the whole page in both themes → every control is reachable, focus is always visible, field errors are announced with their field, and every text and control pair meets AA on `/design`'s contrast audit rules → AC-14 (rendered in the build in both themes)

## Commands

- [x] `npx supabase migration list` → `20260915044956` is on the remote → AC-15 (proven in the build)
- [x] `npx supabase db advisors --linked` → nothing new; only the pre existing `ensure_staff` warning from spec 0004 → AC-15 (proven in the build)
- [x] `npm run check` → lint, format, typecheck and tests all pass → AC-10 (proven in the build)
- [ ] In the SQL editor as a non owner staff token: `select public.reorder_courts(array[1,2], array[1,1])` → `42501` insufficient privilege, and the rows are unchanged → AC-5, value sourcing "whether the caller was allowed"
- [ ] `select public.reorder_courts(array[1,2], array[99,1])` as the owner → `P0002` stale_version and nothing written → AC-5, value sourcing "whether the list is stale"
- [ ] `select public.reorder_courts(array[1,1], array[1,1])` → `22023` → AC-5
- [ ] In the browser console on `/`, subscribe to the `schedule` topic and rename a court → a `court_changed` event whose payload is exactly `op`, `table`, `id`; save the hours → `settings_changed` with the same three keys → AC-11, invariant 6
- [ ] `update public.venue_settings set weekday_open = '24:00'` as the owner → refused by `venue_settings_open_before_midnight_check` → AC-8, invariant 3

## Acceptance-criteria coverage

- AC-1 redirect, non owner, Settings link, noindex · AC-2 sections, skeleton, error and Retry · AC-3 Add court lands last · AC-4 rename, name clash, stale edit · AC-5 reorder, lock, names, live region, stale and forbidden from the function · AC-6 retire refused with the count · AC-7 retired rows, Restore, next free order · AC-8 time options, Midnight, dirty tracking, close after open · AC-9 outside hours count and the two step save · AC-10 midnight close end to end · AC-11 both events, both boards, payload shape · AC-12 horizon shrink goes to today · AC-13 stale and forbidden shown · AC-14 viewport rule, keyboard, disclosure, contrast · AC-15 migration, advisors, the full owner walkthrough with two watching browsers

---

# Verify: opening hours per day · spec 0007 (AC-16 to AC-25) · updated 2026-09-22

_Steps derived from AC-16 to AC-25 and the Value sourcing rows added with them. Ticked steps were run and passed by `/check verify` on 2026-09-23, against the linked Supabase project, a dev server, and Chromium driving the real pages while signed in as an active superadmin. The unticked ones say why below._

## UI / manual

- [x] Sign in as the owner, open `/staff/settings` → the Opening hours form is seven day rows, Monday at the top through Sunday, each with Opens, Closes and a Closed toggle → AC-8
- [x] Set Friday to close at Midnight, leave the other weekdays at 22:00, save → a signed out browser on `/?date=<a Friday>` shows rows to midnight and `/?date=<a Thursday>` stops at 21:00, with no reload on either → AC-18, AC-24, AC-25 (proven in the build by changing `venue_hours` in SQL and reading `/api/schedule`; the reload free part needs two open browsers)
- [x] Mark Monday closed and save → the public board on that Monday shows "Closed all day" above a greyed grid over the week's widest span → AC-19, AC-20 (proven in the build)
- [x] The same Monday on `/staff` → a Closed all day line with an Add booking button, and no grid rows under it → AC-19
- [x] Press Add booking on that closed Monday → the sheet asks for a court, a start and an end; Continue opens the ordinary booking sheet; taking the booking succeeds and the booking then reads as Booked on that Monday on both boards, every other cell Unavailable → AC-19, AC-20
- [ ] Do the same as an ordinary (non owner) active staff account → it is allowed; closed is a statement about the schedule, not a lock → AC-19, invariant 11 (not run on 2026-09-23: the only account to hand was a superadmin)
- [x] Open the date picker on either board → the closed day of the week is muted and struck through, its accessible name ends with "The venue is closed this day.", and it is still selectable → AC-22
- [x] Turn a day's Closed toggle on → its two selects grey out, are announced as disabled, and clear; turn it off → the venue's most common open pair comes back rather than a blank row → AC-8
- [ ] Try to save a day with an opening time and no closing time → refused on the field before anything is sent → AC-8 (not run on 2026-09-23: the Closed toggle clears both times together, so reaching that state needs the selects driven by hand)
- [x] Mark a day closed while two future bookings sit on it → "2 future bookings fall outside these hours. Save anyway?"; Save anyway writes and both bookings still render as Booked on that day → AC-9
- [x] Open the settings page in two browsers, save in one, then save in the other → the second gets the stale message and reloads the fresh week; the seven rows never hold a mix of the two saves → AC-17, AC-13
- [ ] Tab through the seven day form → every select and every Closed toggle is reachable and named with its day; check both themes for AA contrast on the form and on both closed day states → AC-8, AC-19, AC-22 (not run on 2026-09-23: names were read from the DOM and are correct, but no keyboard traversal or contrast measurement was done)
- [ ] Open `/staff/reports` over a range containing a closed day → that day contributes zero open minutes, the hour axis spans the widest pair across the week, and the caveat line mentions that a day closed today reads as closed for the whole range → AC-23 (2026-09-23: the page renders, the axis runs 6am to 11pm from the week's widest pair, the reworded caveat is there and nothing divides by zero; the zero open minutes itself is not observable, because the project holds no past booking data to move utilisation)
- [ ] In PostHog, find the `hours_changed` event from one of the saves above → it carries `days_open`, `days_closed`, `earliest_open`, `latest_close`, `slot_minutes`, `booking_horizon_days` and nothing else → AC-24 (not run on 2026-09-23: no access to the PostHog project from here; five real saves fired the event, and the strict schema is locked by a unit test)

## Commands

- [x] `npx supabase db query --linked "select count(*), count(*) filter (where open_time is null) from public.venue_hours"` → 7 rows → AC-16 (proven in the build)
- [x] `npx supabase db query --linked "select column_name from information_schema.columns where table_name='venue_settings'"` → no `weekday_open`, `weekday_close`, `weekend_open` or `weekend_close` → AC-16 (proven in the build)
- [x] `npx supabase db query --linked "insert into public.venue_hours values (7, '06:00', '22:00')"` as `authenticated` → refused, no insert grant → AC-16, invariant 8
- [x] `npx supabase db query --linked "update public.venue_hours set close_time = null where day_of_week = 2"` → refused by `venue_hours_pair_check` → AC-16, invariant 9
- [x] `npx supabase db query --linked "update public.venue_hours set open_time = '24:00' where day_of_week = 2"` → refused by `venue_hours_open_before_midnight_check` → AC-16, invariant 3
- [x] Call `save_venue_hours` with a `settings_version` that is not the current one → `P0002 stale_version`, and all seven rows are unchanged → AC-17 (proven in the build)
- [x] Call `save_venue_hours` with six entries → `22023` → AC-17
- [x] Call `save_venue_hours` as a non owner `authenticated` account → `42501`, shown as `forbidden`, and the seven rows are unchanged → AC-17, AC-25
- [x] `select grantee, privilege_type from information_schema.routine_privileges where routine_name='save_venue_hours'` → `authenticated` only, never `anon` or `public` → AC-17 (proven in the build)
- [x] `npx supabase db advisors --linked` → nothing new about `venue_hours` or `save_venue_hours` → AC-16 (proven in the build)
- [x] `curl -s "localhost:3000/?date=<a closed day>"` and read the JSON-LD block → one entry per distinct pair, days Monday first, closed days absent → AC-21 (proven in the build)
- [ ] Mark every day of the week closed → the boards fall back to a `06:00` to `22:00` greyed span, the report shows zero open minutes without dividing by zero, and `hours_changed` sends null for `earliest_open` and `latest_close` → AC-20, AC-23, AC-24 (2026-09-23: the `06:00` to `22:00` fallback span and the empty JSON-LD block were proven by setting all seven rows closed in SQL; the report and the event halves were not)
- [x] `npm run check` → lint, format, typecheck and 604 tests green → all (proven in the build)

## Acceptance-criteria coverage

- AC-16 the table, its checks, its grants, the seed and the dropped columns · AC-17 one transaction, the version guard, the row count refusal and the grants · AC-18 the per day lookup, `weekSpan`, and every read carrying the seven days · AC-19 the staff board's closed line and Add booking · AC-20 the public board's greyed grid and a stranded booking still reading Booked · AC-21 the grouped JSON-LD · AC-22 the muted, still selectable closed days in the picker · AC-23 the report's per day open minutes and hour axis · AC-24 the reshaped event and the separate broadcast function · AC-25 the full live proof with a late Friday, a closed Monday and a non owner refusal
