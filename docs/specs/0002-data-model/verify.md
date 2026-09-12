# Verify: Data model · spec 0002 · updated 2026-09-05

_Steps derived from spec 0002 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Several steps need a signed in staff member and a `staff` row, which scope
feature 5 owns. They are listed anyway, marked **needs feature 5**, so nothing
quietly falls off the list once sign in exists.

_Checked on 2026-09-05 by `/check verify`. The ticked steps were run against the
live linked project. The writes were driven with the service role key, which is
admin tooling and bypasses row level security, so they prove the constraints,
the triggers and the broadcast, and they prove nothing about the policies. Every
policy step and every Server Action step is still owed and stays unticked. The
rows created were deleted afterwards._

## Commands

- [x] `npm run check` → lint, format, typecheck and tests all pass → AC-12
- [x] `npx supabase migration list --linked` → local and remote agree, and no `20260903023010` smoke row remains → AC-1
- [x] `npx supabase db advisors --type security --linked` → `No issues found` → AC-1, AC-4
- [x] `npx supabase db advisors --type performance --linked` → `No issues found` → AC-1
- [x] `curl "$URL/rest/v1/court?select=id,name,sort_order" -H "apikey: $ANON"` → the two seeded courts → AC-1
- [x] `curl "$URL/rest/v1/venue_settings?select=*" -H "apikey: $ANON"` → one row, 06:00 to 22:00 weekdays and 06:00 to 23:00 weekends, 60 minute slots, `Asia/Manila` → AC-1
- [x] `curl "$URL/rest/v1/reservation?select=customer_phone" -H "apikey: $ANON"` → `42501 permission denied`, and the same for `amount`, `note` and `select=*` → AC-4
- [x] `curl "$URL/rest/v1/reservation?select=court_id,starts_at,ends_at,kind" -H "apikey: $ANON"` → 200 → AC-4
- [x] `curl -X POST "$URL/rest/v1/reservation" -H "apikey: $ANON" -d '{...}'` → refused, and the same for a PATCH on `court` → AC-6
- [x] Insert two overlapping active rows on one court as an owner, in one transaction or two at once → the second raises `23P01` on `reservation_no_overlap`, and no third row exists → AC-2

## UI / manual

- [x] Book court 1 from 16:00 to 17:00 on a chosen day as signed in staff → the cell reads Booked → AC-2, AC-5 · **needs feature 5**
- [ ] With the public grid already open in a second browser, make that booking → the cell turns Booked within a second or two with no reload → AC-9 · **needs feature 5**
- [x] Watch the realtime payload that arrives in the second browser → it carries `court_id`, `starts_at`, `ends_at`, `kind`, `status` and nothing else, no customer name, phone, note or amount → AC-4 · **needs feature 5**
- [ ] Submit the same court and hour twice at once → exactly one succeeds, the other returns a `slot_taken` conflict, and a third row was never created → AC-2 · **needs feature 5**
- [x] Cancel that booking, then book the same slot again → the cancel succeeds, the rebooking succeeds immediately, and the cancelled row is still readable by staff → AC-3, AC-10 · **needs feature 5**
- [ ] Submit an edit carrying a `version` one behind the row → zero rows change, the caller gets a `version_stale` conflict naming the fresh version → AC-8 · **needs feature 5**
- [ ] Read `reservation_audit` after a create, an edit and a cancel → three rows, each with the old and new values and the Clerk subject in `changed_by` → AC-8 · **needs feature 5**
- [ ] Record a payment: set `payment_status` to `partial` with an amount of `250.50` → it stores exactly, and `waived` with no amount is accepted too → AC-10 · **needs feature 5**
- [ ] As a non owner staff member, edit a booking that ended yesterday → refused; the same edit on a future booking → accepted → AC-6 · **needs feature 5**
- [ ] As a non owner, move a future booking back into the past → refused by the `with check` half of the update policy, not just the app → AC-6 · **needs feature 5**
- [ ] As a non owner, rename a court or change the venue settings → refused; as an owner → accepted → AC-6 · **needs feature 5**
- [ ] Retire a court that has three active future bookings → refused, and the message names the count of three → AC-7 · **needs feature 5**
- [ ] Retire a court whose only future rows are closures → accepted, because a closure is not somebody who will turn up → AC-7 · **needs feature 5**
- [x] Shorten the opening hours so an existing booking falls outside them, then open that day → the booking still appears, in its own row, marked out of hours → AC-11 · **needs feature 5**

## Value sourcing

One step per row of the spec's Value sourcing table, each varying the input that
breaks if the value came from the wrong place.

- [x] Open the grid with no date → the day shown is today in `Asia/Manila`, not today wherever the server is. Set the machine clock to a timezone a day behind and check it does not move → AC-5
- [x] Open a Saturday and a Monday → Saturday closes at 23:00, Monday at 22:00, with the weekday decided in `Asia/Manila` → AC-5
- [x] Run the grid on a machine set to `America/New_York` and again on `UTC` → identical rows for the same date → AC-5
- [x] Open a day and count the rows → 06:00 through 21:00 at 60 minute slots, sixteen rows, the last one ending at 22:00 → AC-5
- [x] Set `slot_minutes` to 90 on a weekday → rows run 06:00 to 21:00 and the trailing partial slot is dropped rather than shown → AC-5
- [x] Book 22:00 to 23:00 on a Saturday, then open that Saturday → the 22:00 row exists; open the same slot on a weekday, when the venue shuts at 22:00 → the booking shows on its own out of hours row → AC-5, AC-11
- [ ] Read the same day as anon and as staff → the anon read carries no customer name, the staff read does → AC-4
- [ ] Look at `changed_by` after any staff write → the Clerk subject, matching what the policies read from the token → AC-8 · **needs feature 5**
- [ ] Compare `updated_at` after a write with the client's clock skewed by an hour → `updated_at` follows the database, not the client → AC-8 · **needs feature 5**
- [x] Book 23:00 to 23:59 Manila time and read `starts_at` back → it is the correct UTC instant, 15:00 the same day, and the booking stays on the day it was made for → AC-5 · **needs feature 5**
- [ ] Book `booking_horizon_days + 1` days ahead → refused as out of the booking window; book exactly on the horizon → accepted → AC-6 · **needs feature 5**
- [x] Ask for the next free time on a court with 16:00 booked → it returns 17:00, not 16:00 → AC-5

## Acceptance-criteria coverage

- AC-1 covered by the migration list, advisor and seed read steps
- AC-2 covered by the overlap insert step and the concurrent booking step
- AC-3 covered by the cancel then rebook step
- AC-4 covered by the anon column steps and the realtime payload step
- AC-5 covered by the grid derivation steps in Value sourcing
- AC-6 covered by the anon write refusals, the past booking steps and the owner only steps
- AC-7 covered by the two retire steps
- AC-8 covered by the stale version step, the audit trail step and the `updated_at` step
- AC-9 covered by the second browser step
- AC-10 covered by the payment step and the cancel step
- AC-11 covered by the shortened opening hours step
- AC-12 covered by `npm run check`, which runs the drift guard in `lib/schedule/constants.test.ts`
