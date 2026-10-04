# Verify: Online booking checkout · spec 0015 · updated 2026-10-02

_Steps derived from spec 0015 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

_Build plan task 1 (the thin thread) is built. Later tasks append their steps here. A test hold stays
Booked until task 4's expiry job exists: release one by hand with
`select private.expire_online_booking(id) from public.booking where status = 'held';`._

## UI / manual

- [ ] With `BOOKING_CLIENT_HASH_SECRET` set, visit `/`, pick a free hour → the booking button reads "Book" → AC-1, AC-26
- [ ] Unset `BOOKING_CLIENT_HASH_SECRET` and reload `/` → the button reads "Request booking" and shows the coming soon toast → AC-26
- [ ] Press Book → a side sheet (bottom sheet below `md`) opens showing the day heading, "Court N: 9pm" grouped by court, the total, and "Step 1 of 4: Details" with the four step names → AC-1
- [ ] Press Next with every field blank → all three fields are marked invalid with their own message, and focus is on Name → AC-2
- [ ] Type a phone of `12345` → "Use a Philippine mobile number, like 0917 123 4567." → AC-2
- [ ] Enter `0917-123 4567` (and separately `+63 917 123 4567`) → Next moves to Terms, focus is on the "Booking rules" heading → AC-2, AC-25
- [ ] On Terms, Next is disabled until the box is ticked; Back returns to Details with every typed value intact → AC-2, AC-3
- [ ] Tick and press Next → "Step 3 of 4: Payment", "Your slots are held", a code shaped `XXXX-XXXX`, and the amount → AC-4, AC-18
- [ ] In a second browser, open `/schedule?date=<that day>` → the held hour reads "Court N at 9pm. Booked" → AC-4
- [ ] Close the sheet → the picker reads the day again, the held tile reads Booked, focus lands on "Your booking" → AC-4, AC-25
- [ ] Two browsers pick the same hour and reach Terms; the second confirms first → the first gets its sheet closed, the tile reads Booked, and one toast "Court 1 at 9pm was just booked." → AC-6

## Commands

- [ ] `select code, status, customer_phone, amount, hourly_rate, terms_version, client_hash is not null, proof_path from public.booking order by id desc limit 1;` → status `held`, phone `+639…`, code without the dash, amount = hours × `hourly_rate`, `proof_path` = `<id>/<submission id>` → AC-4, AC-17, AC-18
- [ ] `select court_id, starts_at, ends_at, amount, created_by, booking_id from public.reservation where booking_id = <id>;` → one row per run of adjacent picks, shares adding up to the booking's amount, `created_by` null → AC-4, AC-17
- [ ] Hold two adjacent hours on one court and one on another → two rows, not three → AC-4
- [ ] Change `venue_settings.hourly_rate` (e.g. to 300) → a new hold charges 300 an hour; an existing hold's amount is unchanged → AC-17 (Value sourcing: amount, rate)
- [ ] Hold with the same `submission_id` twice (Back to Details, edit the name, Next) → same code, same `hold_expires_at`, the new name on the booking and its rows → AC-5
- [ ] Call `hold_online_booking` over the REST API with only the anon key → `42501` → AC-20
- [ ] As the anon key, `select` from `booking` → refused; download a proof path from `payment-proof` → refused; its public URL → not served → AC-20
- [ ] Under a minted `online_booking` token, `createSignedUploadUrl` on the booking's `proof_path` succeeds, two uploads to the signed URL both succeed (the second overwrites), and a signed URL for any other path is refused by row level security → AC-9, AC-20
- [ ] Under the same token, `select` on `booking` and on `reservation.customer_phone` → `42501` → AC-20
- [ ] A pick in the past, outside that day's hours, off the slot grid, on a closed day, or beyond `booking_horizon_days` → `{ ok: false, reason: "out_of_range" }` and nothing written → AC-7 (Value sourcing: slot validity)
- [ ] Vary the day across a Friday (closes `24:00`) → the 11pm slot holds; a pick starting at midnight is refused → AC-4 (Value sourcing: `venue_hours` by `extract(dow)`, timezone)
- [ ] Six new holds from one client hash within 15 minutes → the sixth answers `rate_limited` with `retry_after_seconds` → AC-19 (Value sourcing: client hash)
- [ ] `npx vitest run lib/import-boundaries.test.ts lib/supabase/staff-token.test.ts` → `mintOnlineBookingToken` has one caller (`lib/booking/actions.ts`), its token carries only `role`, `client_hash`, `iat`, `exp` and lives 60 seconds → Consequences, AC-20
- [ ] `npm run check` → green

## Acceptance-criteria coverage

- AC-1 · Book label, sheet, header, step indicator (task 1)
- AC-2 · Details validation, focus, Back keeps values (task 1)
- AC-3 · checkbox gate and `/terms` link only; the rules list and Turnstile are task 2
- AC-4 · the hold, rows per run, both boards (task 1)
- AC-5 · update in place is in the SQL; the sheet's edit loop is task 4
- AC-6 · clash toast and re-read (built early; task 2 finishes the refusals)
- AC-7 · `out_of_range` answer only; the rate limit and bot check screens are task 2
- AC-17 · function side only; the landing page moves onto `hourly_rate` in task 5
- AC-18 · code (task 1)
- AC-20 · anon refused, role confined, private bucket (task 1)
- AC-25 · focus on step change and on close; the rest is task 9
- AC-26 · an interim switch on `BOOKING_CLIENT_HASH_SECRET` only; task 2 and task 5 complete it
- AC-8 to AC-16, AC-19, AC-21 to AC-24 · not built yet

---

# Build plan tasks 2 and 3: the front door, pay and confirm · updated 2026-09-30

_In development, `.env.local` carries Cloudflare's always pass test keys (see `.env.example`). To see
the bot check fail, swap in the always fail pair: site key `2x00000000000000000000AB`, secret
`2x0000000000000000000000000000000AA`. The AC-26 step in the task 1 list above is superseded by the
first step here._

## UI / manual

- [ ] With all four of `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `TURNSTILE_HOSTNAMES`, `BOOKING_CLIENT_HASH_SECRET` set → the button reads "Book"; empty any one of them and reload → "Request booking" and the coming soon toast → AC-26
- [ ] On Terms → the four `BOOKING_RULES` as a list, a "terms" link opening `/terms` in a new tab, the box, and the Turnstile widget; Next stays disabled until the box is ticked **and** the widget has passed → AC-3
- [ ] With the always fail test keys, reach Terms → the widget retries once quietly, then Terms reads "Online booking can't continue on this device" with Messenger and Text us, and Text us opens an `sms:` body naming the picked courts and hours → AC-7
- [ ] Make six new holds from one connection within 15 minutes (a fresh sheet each time) → the sixth stays on Terms with "Too many tries from this connection. Try again in N minutes, or message us." and Messenger and Text us; nothing is written → AC-7, AC-19
- [ ] Pass Terms → Payment shows the QR (a marked empty frame while `PAYMENT_QR_SRC` is a placeholder), "Pay to" the account name, "Send exactly ₱500" for two hours, the code `XXXX-XXXX` with "Add it to your transfer message if your app allows", and "Your slots are held for 5:00" counting down → AC-8
- [ ] Set the device clock five minutes ahead, then hold → the countdown still starts near 5:00, because it counts from the server's `now` → AC-8 (Value sourcing: countdown)
- [ ] Type `98a76` in the digits field → it reads `9876`; Next stays disabled until 4 digits are in **and** the screenshot has uploaded → AC-8
- [ ] Choose a GIF, a PDF, or a PNG over 10 MB → refused on the field with its reason, no upload starts → AC-8, AC-9
- [ ] Choose a large phone screenshot → a thumbnail, "Uploading", then "Screenshot uploaded"; the stored object is WebP (JPEG on Safari) with its long edge at most 1600 pixels → AC-9
- [ ] Go offline, choose a screenshot → "The upload didn't go through" with Retry; back online, Retry → uploaded. Replace with another image → the same object path is overwritten → AC-9
- [ ] Next → Review shows the day, courts and hours, total, name, phone, email, the digits and the thumbnail; "Edit your details" and "Edit payment" jump to their steps and every value is still there → AC-11
- [ ] From Review, Edit your details, change the name, Next through Terms (a fresh Turnstile pass) → Payment shows the **same** code, the countdown did not restart, and the digits and screenshot are kept → AC-5
- [ ] Confirm booking → the receipt titled "Booking received": "Waiting for payment check", the code large with Copy code, Booking (day, "Court 2: 5am to 7am", hours, total), Customer (name, phone, email), Payment (amount, QR transfer, "Reference ending 9876", "Screenshot received", the submitted time in Manila time), and the save line → AC-14
- [ ] Double tap Confirm booking (or throttle the network and tap twice) → one booking, one set of rows → AC-12
- [ ] Done → the sheet closes, the picks clear, and the booked tiles read Booked → AC-14
- [ ] At 360 pixels wide, walk every step → no sideways page scroll, every button at least 44 pixels tall → AC-25

## Commands

- [ ] Hold, then call `submit_online_booking` before any upload → `{ ok: false, reason: "proof_missing" }` → AC-12 (Value sourcing: proof exists)
- [ ] After a live submit: `select status, reference_last4, submitted_at, hold_expires_at from public.booking where code = '<code>';` → `pending_check`, the digits, `submitted_at` set, `hold_expires_at` unchanged → AC-12
- [ ] A PUT to the hold's signed upload URL **after** submit → refused (`guard_payment_proof_write`); the screenshot staff will check is the one that was submitted → AC-20, invariant 3b
- [ ] Let a hold lapse (`update public.booking set hold_expires_at = now() - interval '1 second' where id = <id>;`), then Confirm → `pending_check`, `retaken: true`, fresh active rows, the hold's amount kept, the old rows still linked and cancelled → AC-12
- [ ] Let a hold lapse, take one of its slots with another hold, then Confirm → `slot_taken` naming that slot; the booking stays `expired` with the digits and `submitted_at` saved; the sheet names the slot and shows the refund message with the code and Messenger and Text us (the text prefilled with the code and digits) → AC-13
- [ ] Repeat the same `submit_online_booking` call in each case above → the same answer, nothing new written → AC-12
- [ ] Siteverify rules: `npx vitest run lib/booking/turnstile.test.ts` → a wrong action, a wrong hostname, or a non `true` success is refused; a testing key answer passes only outside production → AC-19
- [ ] Replay a used Turnstile token to `holdOnlineBooking` → `bot_check`, nothing minted or written → AC-19
- [ ] The receipt and the hold results carry the code and digits, and never a `proof_path` → AC-20
- [ ] `npm run check` → green

## Acceptance-criteria coverage (tasks 2 and 3)

- AC-3 · rules list, `/terms` link, Turnstile gating Next
- AC-5 · the sheet's edit loop, now live through Review's Edit links
- AC-6 · the clash at hold, unchanged from task 1 and now behind Turnstile
- AC-7 · the rate limit and bot check screens
- AC-8 · Payment step, the countdown from the server's clock
- AC-9 · shrink, upload, Replace and Retry, the field refusals
- AC-10 · the countdown's end line and its two announcements are built; the expiry job that frees the slots is task 4
- AC-11 · Review with Edit links
- AC-12 · Confirm, idempotent, including the retake after a lapse
- AC-13 · the refund message and the saved digits (built early; task 4 owns its full run)
- AC-14 · the full receipt
- AC-19 · Siteverify with action and hostname, failing closed, plus the database rate limit
- AC-20 · the proof locked after submit by trigger, not only by policy
- AC-26 · the switch now needs all four checkout values; the payment placeholders join in task 5

---

# Build plan tasks 4 and 5: the hold's life and one price · updated 2026-09-30

_Checkout is now off while `PAYMENT_ACCOUNT_NAME` or `PAYMENT_QR_SRC` in `lib/venue.ts` is a
placeholder (AC-26). To walk the sheet before Ella supplies them, put stand in values there on a
local branch and never commit them. This supersedes the AC-26 step in the task 2 and 3 list above.
The hand release note at the top is no longer needed: the minute job ends every lapsed hold._

## UI / manual

- [ ] With the four checkout values set and real payment facts → "Book"; put `[` back in either payment fact and reload → "Request booking" and the coming soon toast, exactly as spec 0013 AC-13 → AC-26
- [ ] Hold, go Back to Details, change the name, Next again (a fresh Turnstile token) → Payment shows the same code and the countdown carries on from where it was, not from 5:00 → AC-5
- [ ] On Payment, let the countdown reach zero → the line reads "Your hold ended. You can still confirm, and we'll book the slots if they're still free."; with a screen reader, the countdown is heard only at one minute left and at zero → AC-10
- [ ] Hold, then close the sheet from Terms or Payment with nothing typed (close button, then again with Escape, then the overlay) → it closes at once, the picks stay picked, and in a second browser `/schedule` shows the slots free again straight away → AC-15
- [ ] Hold, type the reference digits or upload a screenshot, then close → "Leave checkout? Your held slots will be released." with Stay focused first; Stay keeps the sheet as it was; Leave closes it and frees the slots on both boards → AC-15
- [ ] Reach the receipt and press Done → the picks clear, the day reads again, and the new booking still shows Booked on both boards → AC-14, AC-15
- [ ] Hold, close the tab, wait → both boards show the slots free within a minute of the hold's end → AC-16
- [ ] Hold, wait past 5 minutes, Confirm → the receipt, and the booking reads `pending_check`; repeat, but book one of the slots from the staff board in between → nothing is booked, the refund message names the slot, and Text us carries the code and digits → AC-12, AC-13
- [ ] Set `venue_settings.hourly_rate` to 300, reload `/` → the hero stat, the rental card, the offers lede, the picker's "per court hour" line and its total all read ₱300; set it back → AC-17 (Value sourcing: sheet header total)
- [ ] With the read failing (or over the public read limit), `/` shows no price anywhere rather than a guessed one → AC-17
- [ ] As staff, open `/staff/reports` on a day with an abandoned hold and a staff cancel → the staff cancel is listed, the abandoned hold is not → AC-16 (Value sourcing: report day list)

## Commands

- [ ] `DB_TESTS=1 npx vitest run supabase/tests/online_booking_hold_life.test.ts` → 5 pass: the minute job ends only lapsed holds, keeps `hold_expires_at`, cancels with `cancelled_by` null; release ends a live hold once and never a submitted one; anon and authenticated are refused → AC-15, AC-16, AC-20
- [ ] `select jobname, schedule from cron.job where jobname = 'expire_online_holds';` → `* * * * *`; `cron.job_run_details` for it shows `succeeded` each minute → AC-16
- [ ] `select count(*) from public.booking where status = 'held' and hold_expires_at < now() - interval '2 minutes';` → 0 → AC-16
- [ ] `grep -rn PRICE_PER_HOUR app components lib` → nothing → AC-17
- [ ] `npx vitest run lib/booking/switch.test.ts lib/report/queries.test.ts components/landing app/\(landing\)` → pass: the switch waits on both payment facts, the report asks for the system cancel filter, and every price follows `hourlyRate` → AC-16, AC-17, AC-26

## Acceptance-criteria coverage (tasks 4 and 5)

- AC-5 · update in place, same code and expiry (the SQL landed in task 1; the step above proves it through the sheet)
- AC-10 · the countdown's end state and its two announcements (built in task 3)
- AC-12, AC-13 · the retake and the refund path, now run end to end with a real lapse
- AC-15 · `release_online_booking`, `releaseOnlineBooking`, and the Leave checkout? dialog
- AC-16 · `expire_online_holds()` every minute, the cleanup inside the hold, the report's day list filter
- AC-17 · `hourly_rate` on the schedule read and every landing price; `PRICE_PER_HOUR` removed
- AC-26 · complete: the four values and both payment facts

---

# Build plan tasks 6, 7 and 8: staff, privacy and signals · updated 2026-09-30

_Steps derived from spec 0015 AC-21 to AC-24 and the Value sourcing rows for the staff sheet and the privacy page. Before running them: `npx supabase db push` (migration `20260929231732_online_booking_retention.sql`), deploy `purge-payment-proofs`, and set its secret and the two Vault secrets (see the Commands below)._

## UI / manual

- [ ] Sign in to `/staff`; the privacy acknowledgement dialog shows again (version `2026-09-30`) and names the email, reference digits and screenshot → AC-22
- [ ] Hold a booking on `/` (reach Payment), then on `/staff` open that cell → the sheet shows an "Online booking" block: State "Held, not yet paid", the code as `XXXX-XXXX`, the email, Reference "Not sent yet"; the footer reads "Booked online at …", not a staff name → AC-21
- [ ] Finish that checkout with digits `1234`, keep the staff sheet open → within the live delay the block reads "Payment not yet checked", Reference "Ending 1234", and a Sent time in Manila time → AC-21
- [ ] Hold another and close the sheet (release), then open the freed booking's cancelled row from the report or a direct read → state "Expired" → AC-21
- [ ] The board cell for an online booking looks exactly like a desk booking (no new styling) → AC-21
- [ ] Sign out, or use a deactivated staff account, and call `loadStaffBooking` → no booking comes back (`unauthenticated`, or `not_found` under the policy) → AC-21
- [ ] Visit `/privacy` → a section on what online booking collects (email, reference digits, screenshot, the Turnstile check and hashed address) and a section listing 90, 90, 30, 90, 1 and 1 days, each tied to its field → AC-22
- [ ] Visit `/terms` → a "Booking online" section listing the four `BOOKING_RULES` lines and version `2026-09-30`; no line says the site takes no bookings → AC-22
- [ ] With `NEXT_PUBLIC_POSTHOG_KEY` set, run one hold, one submit, and one bot check failure → PostHog shows `online_booking_held`, `online_booking_submitted` and `online_booking_refused { stage: "hold", reason: "bot_check" }`, each with a different distinct id, no person profile, and no code, name, phone, email, digits or path → AC-24
- [ ] Trigger a `not_found` submit (a random submission id) → only a `console.warn` in the server log, no PostHog event → AC-24

## Commands

- [ ] `npx supabase db push` → applies `20260929231732_online_booking_retention.sql` cleanly → AC-23
- [ ] `npx supabase db advisors --linked` → nothing new about `purge_online_booking_details`, `payment_proofs_due`, `forget_payment_proofs` or `private.request_payment_proof_purge` → AC-23
- [ ] `npx supabase functions deploy purge-payment-proofs --no-verify-jwt` and `npx supabase secrets set PROOF_PURGE_SECRET=<value>`; in SQL, `select vault.create_secret('<https://ref.supabase.co>', 'project_url'); select vault.create_secret('<value>', 'proof_purge_secret');` → AC-23
- [ ] `npx supabase db query --linked "select jobname, schedule from cron.job where jobname in ('purge_online_booking_details','purge_payment_proofs')"` → `5 19 * * *` and `10 19 * * *` → AC-23
- [ ] `npx supabase db query --linked "select private.request_payment_proof_purge()"`, then read `net._http_response` for that id → status 200 and `{"deleted":N}` → AC-23
- [ ] `curl -X POST <project>/functions/v1/purge-payment-proofs -H 'x-purge-secret: wrong'` → 401 → AC-23
- [ ] Upload a proof, leave the booking unsubmitted, backdate its `hold_expires_at` by two days, run the purge request → the object is gone from `payment-proof` and `proof_path` is null → AC-23
- [ ] `npm run test:db -- supabase/tests/online_booking_retention.test.ts` → every boundary from the constants holds, and anon, authenticated and online_booking are refused on all three functions → AC-20, AC-23, invariant 8
- [ ] `npx vitest run app/privacy app/terms lib/booking/analytics.test.ts lib/analytics/server.test.ts components/staff/format.test.ts` → green → AC-21, AC-22, AC-24

## Acceptance-criteria coverage (tasks 6, 7 and 8)

- AC-21 · `getBookingForStaff()` and `loadStaffBooking`, the Online booking block, "Booked online" and "Last changed online"
- AC-22 · `/privacy` and `/terms` from the constants, `PRIVACY_NOTICE_VERSION` bumped to `2026-09-30`, the staff dialog's new line; `BOOKING_TERMS_VERSION` on every booking was already stored by the hold (task 1)
- AC-23 · `purge_online_booking_details()` nightly, `payment_proofs_due()` and `forget_payment_proofs()`, the `purge-payment-proofs` Edge Function called through `pg_net` with the secret from Vault
- AC-24 · `capturePublicEvent()` and the three events on the allow list; `invalid` and `not_found` only warned; `failed` through `reportFailure()` (already in place)

---

# Build plan task 9: finish · updated 2026-10-01

_Steps derived from spec 0015 AC-25, plus the database and unit tests that re prove AC-6, AC-12, AC-19 and AC-20. To walk the sheet, put stand in payment facts in `lib/venue.ts` locally (never commit them), as in the task 4 and 5 note above. Stop at Review unless you mean to leave a real `pending_check` booking on the board._

## UI / manual

- [ ] At 360 by 780, open the sheet and press Next on Details → Terms slides in from the right over about 220ms, and focus is on "Booking rules" → AC-25
- [ ] Press Back → Details slides in from the left, every typed value is still there, and focus is on "Your details" → AC-2, AC-25
- [ ] Review's "Edit payment" → Payment slides in from the left with the digits and "Screenshot uploaded" kept → AC-11, AC-25
- [ ] Turn on reduced motion (macOS: Accessibility, Display, Reduce motion) and step through → each step swaps in place with nothing sliding, and focus still moves to the heading → AC-25
- [ ] At 360 pixels, on every step, `document.documentElement.scrollWidth > innerWidth` and the sheet's own `scrollWidth > clientWidth` are both false, even mid slide → AC-25
- [ ] Every button in the sheet, the close button included, is at least 44 pixels tall; the Terms checkbox's whole label (at least 44 pixels) ticks it → AC-25
- [ ] Walk Details to Review with the keyboard only (Tab, Space, Enter) → every control is reachable, and Escape on Payment or Review with digits typed opens "Leave checkout?" with Stay focused first → AC-15, AC-25
- [ ] The staff board's sheets (book, edit, details, close) show the same 44 pixel close button, and the title never runs under it → design.md target size
- [ ] Status never relies on colour alone: the upload states, the refund message and the step indicator each carry an icon or words → AC-25

## Commands

- [ ] `DB_TESTS=1 npx vitest run supabase/tests/online_booking_hold.test.ts supabase/tests/online_booking_submit.test.ts` → 25 pass: the hold's code, expiry, runs and price; update in place; the clash; the lapsed hold cleanup; every out_of_range and invalid case; the rate limit per client; no client hash refused; anon and authenticated refused; online_booking cannot read `booking` or a phone; proof_missing; the live submit repeated; the retake; the refund path repeated; the proof lock after submit → AC-4 to AC-7, AC-12, AC-13, AC-16 to AC-20
- [ ] `npm run test:db` → every database test passes → every AC with a database side
- [ ] `npx vitest run lib/booking` → pass: phone normalising, the details messages, no price or path accepted, the code format, the WebP to JPEG fallback, the upload PUT, and every action result and its event → AC-2, AC-8, AC-9, AC-12, AC-14, AC-17 to AC-20, AC-24
- [ ] `grep -n "dur-step\|checkout-step" app/globals.css` → the keyframe and its duration token, and the animation only inside `prefers-reduced-motion: no-preference` → AC-25
- [ ] `npm run check` → green

## Acceptance-criteria coverage (task 9)

- AC-25 · step motion both ways, reduced motion, focus on step change, 44 pixel targets including the close button, no sideways scroll at 360 pixels, keyboard walk
- AC-6, AC-12, AC-19, AC-20 · re proven by the new database tests and the action tests
- Every AC · `npm run check` and `npm run test:db` green

## Task 10: the checkout card (amendment 2026-10-02)

_These supersede the task 1 to 9 steps that name the old copy: the side or bottom sheet, "Step 1 of 4" with four step names, the single terms checkbox, "Booking received" and "Waiting for payment check". Run these instead of those lines._

### UI / manual

- [ ] At 360 by 780, pick two adjacent free hours on one court and one on another, press Book → a centered card 16 pixels from each edge, no sideways page scroll, the board dimmed lightly and blurred behind it, focus on the "Your details" heading → AC-1, AC-25, AC-27
- [ ] The same at 1280 wide → the card is centered at 28rem, not docked to a side → AC-27
- [ ] On Details → five progress segments with the first filled; the header shows an icon tile, "Your details", "Who's playing, and how we reach you." and a close button, no back arrow; the footer shows "Cancel" and "Next" → AC-1, AC-27
- [ ] On Details → the Selected courts and slots card shows one row per run ("Court 1", the day, "5pm to 7pm", a "2 hr" chip), then "Court hours (3)" with its amount and "Total" → AC-1
- [ ] Pick a slot ending at midnight and open the card → its row reads "to Midnight", never "to 12am" or "00:00" → AC-1 (value sourcing: end times)
- [ ] Next on Terms → one summary line under the header, e.g. "Sat 3 Oct · 3 hours · ₱750", with the hours summed across every court → AC-1 (value sourcing: summary line)
- [ ] On Terms → the rules sit in a bordered box that scrolls on its own and takes Tab focus; the first rule reads "Your booking is confirmed when you finish checkout. Staff check every payment afterwards…" → AC-3, AC-22
- [ ] On Terms → three boxes, each label a 44 pixel target; "Terms" opens `/terms` and "Privacy notice" opens `/privacy`, each in a new tab, without ticking its box → AC-3
- [ ] "Next: Pay" stays disabled with any box unticked, and with all three ticked until Turnstile issues a token → AC-3
- [ ] Tick all three, go Back to Details, come forward again → all three are still ticked → AC-3
- [ ] Next: Pay → the hold banner "Your slots are held for you" with a time chip sits above the header, the header reads "Pay by GCash", and the third segment is filled → AC-8, AC-27
- [ ] Set the device clock five minutes fast and repeat → the chip still starts near 5:00, because it counts from the server's `now` → AC-8 (value sourcing: countdown)
- [ ] Wait out the hold on Payment → the banner reads "Your hold ended. You can still confirm, and we'll book the slots if they're still free."; a screen reader hears it once at one minute and once at zero → AC-10
- [ ] On Review → the banner still shows; three cards under small caps labels: Booking details (the runs card), Your details with Edit, Payment ("GCash transfer", "•••• 1234", the thumbnail, "Screenshot attached") with Edit; each Edit button is at least 44 by 44 and jumps to its step → AC-11
- [ ] On Review → the header back arrow ("Back to Payment") and the footer "Back" go to the same step → AC-27
- [ ] Confirm booking → the receipt: all five segments filled, a round check badge, "Booking confirmed" and "Your code is how you find your booking.", the code large as `XXXX-XXXX` with Copy, the runs card, Customer, Payment with "•••• 1234", "Screenshot received" and the submitted time in Manila time, "Total paid", a "Confirmed" chip with a check icon, the staff check line and "Save or screenshot this page."; no hold banner and no back arrow → AC-14, AC-27
- [ ] Open the staff details sheet for that booking → it reads "Payment not yet checked" while the player's receipt says Confirmed → AC-14, AC-21 (value sourcing: the receipt's word is fixed copy)
- [ ] Done → the card closes, the picks clear, the day reads again, and focus lands on the "Your booking" heading → AC-14, AC-27
- [ ] With digits typed on Payment, press Close → "Leave checkout?" opens over the same light dim, not the dark staff one; Leave frees the slots on `/schedule` and focus lands on "Your booking" → AC-15, AC-27
- [ ] Cancel on Details before any hold → the card just closes; Cancel on Details after Back from a live hold → the hold is released → AC-27, AC-15
- [ ] Close by Escape and by a tap on the dim → both behave as the close button, and focus lands on "Your booking" → AC-15, AC-27
- [ ] Force a slot taken refusal at the hold → the card closes, the toast names the slot, and focus lands on "Your booking", never the page body → AC-6, AC-27
- [ ] With the slot gone after expiry, Confirm → the refund message shows in the Review body with no hold banner and no back arrow → AC-13, AC-27
- [ ] With reduced motion on → the card and the steps only fade or swap in place; without it, the card grows in from 96% and leaves faster than it came, steps slide forward and back, and buttons scale on press → AC-25
- [ ] Walk the whole card by keyboard only at 360 pixels, with the phone keyboard open on Details → every field stays reachable inside the card's scrolling body → AC-25

### Commands

- [ ] `npx vitest run lib/booking/schemas.test.ts lib/booking/actions.test.ts` → a hold missing any one consent is refused `invalid` before Turnstile or a token → AC-3
- [ ] `npx vitest run components/landing/booking.test.ts components/landing/checkout-receipt.test.ts` → runs merge as the hold writes them, and the receipt reads Confirmed with the masked reference → AC-1, AC-11, AC-14
- [ ] After a real hold, `select terms_version from public.booking order by id desc limit 1;` → `2026-10-02`, while earlier bookings keep `2026-09-30` → AC-22
- [ ] `npm run check` → lint, format, typecheck and tests green → every AC

### Acceptance-criteria coverage (task 10)

- AC-1 · the runs card, the summary line, the five segments, the midnight end
- AC-3 · three boxes, the scrolling rules box, the new tab links, the Zod literals
- AC-8, AC-10 · the hold banner, its chip from the server clock, its end line
- AC-11 · Review in three cards with Edit
- AC-14 · the confirmed receipt, and staff still reading "Payment not yet checked"
- AC-15 · Leave over the soft dim
- AC-22 · the new first rule and `BOOKING_TERMS_VERSION` `2026-10-02`
- AC-25 · card motion, press scale, reduced motion, 360 pixels, keyboard
- AC-27 · the card shape, the header, the pinned footer, Cancel, the shared back handler, focus on every way out
