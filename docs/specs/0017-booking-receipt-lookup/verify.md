# Verify: Booking receipt and lookup · spec 0017 · updated 2026-10-04

_Steps derived from spec 0017 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Existing bookings on the linked project you can look up without writing anything (as of 2026-10-04): `PXVX4JA8` (pending_check, reads Confirmed), `SS2M4A27` (rejected and refunded), `BNTR3CNM` (expired after payment, reads Not booked). A wrong code writes one miss row for your connection, deleted after a day.

## UI / manual

- [ ] Open `/booking` at 360 pixels wide → top bar, "Find your booking", the line under it, a "Booking code" field with placeholder `K7MQ-3XPT`, "Find booking", the "Where's my code?" card and the footer; no sideways scroll → AC-1
- [ ] View the page source of `/booking` → `<meta name="robots" content="noindex, nofollow">` and the title "Find your booking" → AC-1
- [ ] Type `ABC` and press Find booking → "A booking code is 8 letters and numbers, like K7MQ-3XPT." under the field, the field has `aria-invalid` and `aria-describedby` pointing at it, and no network request to the action → AC-2
- [ ] Type `pxvx 4ja8` (lowercase, a space) → it finds `PXVX-4JA8`: proves the uppercase and strip rule → AC-2
- [ ] Find `PXVX4JA8` → badge "Confirmed" with a check, "Booking confirmed", the staff line, the code grouped with Copy code, Selected courts and slots, Customer, Payment ("GCash transfer", "Sent" with a Manila time), "Total paid", Check again, Save as image, Save as PDF, Need a change? with Messenger and Text us; focus lands on "Booking confirmed" → AC-3
- [ ] On that receipt: Name is the first word only, Mobile reads `•••• ` plus 4 digits, Email reads first letter, `•••@`, domain; no reference digits anywhere → AC-4
- [ ] Find `SS2M4A27` → "Cancelled" with an X, "Booking cancelled", the reason line for its decision (not the staff note), "Refunded ₱750 on Sat 3 Oct", and "Total" not "Total paid" → AC-5, AC-6
- [ ] Find `BNTR3CNM` → "Not booked", "Your payment arrived after your slots were taken.", the runs it tried for, "Total" → AC-7
- [ ] Find `ZZZZ2345` → "We couldn't find a booking with that code. Check it against your receipt, or message us." with Messenger and Text us → AC-8
- [ ] Press Text us on a found receipt → the message body names the code → AC-3
- [ ] On a found receipt, press Check again → the result swaps in place, focus stays on Check again, "Checked at" updates → AC-12
- [ ] On a found receipt, switch to another tab and back → the page reads the booking again (network shows one action call) → AC-12
- [ ] With the found receipt open, have a manager turn the booking down in `/staff`, then return to the tab → it reads Cancelled and a screen reader hears "Status changed: Cancelled" → AC-12
- [ ] Stop the network (DevTools offline) and press Find booking → "We couldn't check your booking just now." with Try again, Messenger and Text us → AC-13
- [ ] On a found receipt press Save as PDF and save → one A4 page: venue name, address and phone at the top, status, code, runs, masked Customer, Payment and total in black on white with borders, no top bar, form, buttons or footer → AC-14
- [ ] Press Save as image on a found receipt (phone: share sheet; desktop: download) → the image shows the status word and title, the masked contact, the reason and refund lines when present, and no reference → AC-15
- [ ] Complete a real checkout (needs checkout switched on, Turnstile test keys) → the receipt step shows Save as image, Save as PDF and Track this booking; its contact stays in full; Save as PDF prints the receipt alone from the top of the page, not the dialog → AC-14, AC-16
- [ ] Press Track this booking → `/booking` opens in a new tab, finds the booking, the address bar ends at `/booking` with no fragment, and the field shows the code → AC-11
- [ ] With checkout on, `/` and `/booking` show "Find my booking" in the top bar (md and up) and the footer's Play column; with it off, neither does; "Offers", "Book" and "Visit" from `/booking` go to the sections on `/` → AC-17
- [ ] As a manager, open a booking's turn down message in `/staff` → it ends "See your booking any time at <site>/booking" → AC-17
- [ ] Open `/privacy` → the line about a wrong booking code keeping a hash of your connection for 1 day → AC-19
- [ ] Keyboard only on `/booking`: every control reachable and visible on focus, each at least 44 pixels tall; with reduced motion on, the result only fades → AC-21

## Commands

- [ ] `npm run check` → lint, format, typecheck and unit tests pass → AC-2, AC-3 to AC-7, AC-11, AC-14 to AC-18, AC-20
- [ ] `npm run test:db` → `supabase/tests/booking_lookup.test.ts` passes: found and masked with exactly the allowed keys, unknown and abandoned codes both `not_found` and both a miss, Cancelled with the latest reason and no note, Not booked, ended a day either side of 30, the limit after 5, 8 parallel wrong codes count exactly 5, anon and staff refused, `booking_lookup` refused everything else, old misses purged → AC-8, AC-9, AC-10, AC-18, AC-19
- [ ] `npx supabase db advisors --linked` → nothing on `booking_lookup_miss` or `lookup_online_booking` → AC-18
- [ ] `curl -s http://localhost:3000/robots.txt` → `/booking` is not disallowed; `curl -s http://localhost:3000/sitemap.xml` → no `/booking` → AC-1
- [ ] In PostHog, after a few lookups → one `booking_lookup` event per answer with `result` (and `view` when found), never a code or hash → AC-20

## Value sourcing (each value's source, with the edge that breaks if it is wrong)

- [ ] Normalised code: `" k7-mq 3x-pt "` finds the same booking as `K7MQ3XPT` → input, uppercased and stripped
- [ ] Client hash: two lookups from one connection count against one limit; a request with no address hashes `unknown` (`hashClient(null)`) → `hashClient()`
- [ ] Miss count and retry seconds: after 5 misses, the refusal's minutes equal the oldest miss's age subtracted from 15, rounded up, at least 1 → `booking_lookup_miss`
- [ ] View kind: one booking in each status (`pending_check`, `confirmed`, `rejected`, `cancelled`, `expired` with and without `submitted_at`, `held`) reads per the spec's table → `booking.status`, `submitted_at`
- [ ] Ended date: a booking whose last run is 10pm to midnight on day X, ended 31 days ago, names day X, not X + 1 → last standing run's `starts_at` in Asia/Manila
- [ ] Badge and title: "Confirmed / Booking confirmed", "Cancelled / Booking cancelled", "Not booked / Not booked" → `components/receipt/receipt-view.ts`
- [ ] Reason line: a booking rejected then later cancelled shows the cancel reason, the latest → latest `booking_event` of kind rejected or cancelled
- [ ] Refund line: owed shows `booking.amount`; refunded shows `refund_amount` (vary it from `amount`) and the Manila day of `refunded_at` (try a time just after Manila midnight) → `booking` refund columns
- [ ] Limit refusal minutes: 61 seconds reads "2 minutes", 60 reads "1 minute" → `Math.max(1, Math.ceil(s / 60))`
- [ ] Customer: a name with leading spaces and two spaces between words shows only the first word → masked in SQL
- [ ] Runs: a booking on a court since retired still names that court; a retaken booking shows the retake's rows, not the first hold's → `court.name`, standing rows rule
- [ ] Payment: "Sent" shows the Manila time of `submitted_at` whatever the device's timezone (set the device to UTC) → `booking.submitted_at`
- [ ] Total: "Total paid" only on Confirmed; amount through `formatPeso()` → `booking.amount`
- [ ] Need a change?: the Text us body carries the grouped code → `bookingCodeSmsBody()`
- [ ] Track this booking: the link is `/booking#` plus the code without the dash → the submit result's stored code
- [ ] Staff texts: with `NEXT_PUBLIC_SITE_URL` set to a value with a trailing slash, the line has one slash before `booking` → `NEXT_PUBLIC_SITE_URL`
- [ ] Print: venue name, address and phone come from `lib/venue.ts` → `VENUE_NAME`, `VENUE_ADDRESS`, `VENUE_PHONE_DISPLAY`
- [ ] Find my booking links: follow `checkoutEnabled()` per request (flip an env value, reload) → `checkoutEnabled()`
- [ ] Analytics: `result` and `view` match the answer the page showed → the function's answer

## Acceptance-criteria coverage

- AC-1: page, metadata, robots and sitemap steps · AC-2: `ABC` and lowercase steps · AC-3: `PXVX4JA8` step, Text us step · AC-4: masked contact step · AC-5, AC-6: `SS2M4A27` step, refund sourcing · AC-7: `BNTR3CNM` step · AC-8: `ZZZZ2345` step, `test:db` · AC-9: `test:db`, ended date sourcing · AC-10: `test:db`, limit minutes · AC-11: Track this booking step · AC-12: Check again, tab return, status change steps · AC-13: offline step · AC-14: Save as PDF steps · AC-15: Save as image step · AC-16: real checkout step · AC-17: links and staff text steps · AC-18: `test:db`, advisors · AC-19: `/privacy` step, `test:db` purge · AC-20: PostHog step · AC-21: keyboard and reduced motion step
