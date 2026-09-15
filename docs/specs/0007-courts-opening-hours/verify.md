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
