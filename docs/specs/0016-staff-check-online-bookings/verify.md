# Verify: Staff check of online bookings · spec 0016 · updated 2026-10-03

_Steps derived from spec 0016 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Accounts: an admin (or owner) and a plain `staff` account, each in its own browser. A third, signed out browser plays the player on `/`. Write down any real booking you change, so you can put it back.

## UI / manual

- [x] Signed in as plain staff on `/staff`, any day → the toolbar shows "To check · N" (or "All checked" with a check icon when nothing waits), and adds "· N refund(s)" when any refund is owed → AC-1
- [x] Move the board to another day → the chip keeps the same count (it counts every day) → AC-1, value sourcing: chip counts
- [x] Press the chip → a sheet titled "Online bookings" with Find by booking code, To check, and Refunds owed; each item shows name, `XXXX-XXXX` code, first run "Court N · Ddd D Mmm · Xpm to Ypm" (+N more when several), amount, "Ending 1234" → AC-2
- [ ] To check order: a booking whose first slot already began sits on top; then soonest first slot. Refunds owed: oldest submit first → AC-2, AC-16, value sourcing: list order
- [ ] An empty section reads "Nothing waiting." → AC-2
- [x] Type a valid code without the dash in lower case → its sheet opens as soon as the 8th character lands. Type `K7MQ` and press Find → "A code is 8 letters and numbers, like K7MQ-3XPT." A valid but unknown code → "No online booking with that code." → AC-3
- [x] Find an expired or cancelled booking by its code → its sheet opens with that state → AC-3
- [ ] As the player, hold and submit on `/` in the signed out browser → within a few seconds both staff boards' chips go up by one and a toast reads "New online booking to check: Court N, Ddd D Mmm, Xpm" with Open; Open opens its sheet; no sound; the same booking never toasts twice in that tab; the public board never toasts → AC-5
- [ ] While the player is on the Payment step, the cell shows a globe and "Held · Name"; after submit, "Check payment · Name"; after Confirm, only the globe. Cell colours do not change. A screen reader name adds "online booking" and "payment not yet checked" → AC-4
- [ ] Open the booking from its cell, from the list and from a code: the same check view each time (state badge, refund line when set, code, "Amount due", "Ending", screenshot, player, phone, email, sent time in Asia/Manila, every run, History) → AC-6
- [ ] Press the screenshot → full screen, fitted, Escape and the close button close it, pinch zoom works on a phone; alt text "Payment screenshot for booking XXXX-XXXX". View source: no signed URL in the HTML → AC-17
- [ ] As plain staff: no Confirm, Turn down or Cancel; the line "Only an owner or admin can confirm or turn down a payment."; the screenshot still opens → AC-7, AC-17
- [ ] As admin: Confirm payment → the badge reads "Payment confirmed", the rows read Paid, History reads "Confirmed by <name> · Ddd D Mmm, H:MMam", and the chip drops on the other board too → AC-7
- [ ] As admin on a confirmed booking: Turn down payment → pick "Amount doesn't match": the refund box ticks itself and the message names "₱X due" and "We'll send ₱X back…"; edit the text, change the reason, the text stays as typed; "Copy message" shows "Copied" for 2 seconds; "Text the player" opens an `sms:` link → AC-8, AC-9
- [ ] Press Turn down → the hours read Available on `/` and `/staff`, the booking moves to Refunds owed, History reads "Turned down by … · Amount doesn't match · Refund owed" → AC-8, AC-12
- [ ] On a confirmed two run booking, Cancel booking → reasons from the cancel list, refund box ticked by default; confirming frees both runs → AC-10
- [ ] On a held row: no Cancel, the line "Held for checkout. It frees itself within 5 minutes if not paid." → AC-10
- [ ] Under Refunds owed: Mark refunded (prefilled with the amount) with ₱500 → the refund line reads "Refunded ₱500 on Ddd D Mmm by <name>" and the booking leaves the list; No refund needed refuses an empty note → AC-12
- [ ] A paid after hold booking (expired with a submit) lists under Refunds owed as "Expired, paid after the hold" with only the refund buttons → AC-13
- [ ] Two admin browsers on the same unchecked booking: one confirms, the other then turns down → "Someone else just updated this booking. Here's where it stands now." and the fresh state; nothing written → AC-14
- [ ] As plain staff, edit an online row's phone → the booking's phone and its other row's phone change; the edit sheet shows no Payment or Amount fields; an admin's Confirm opened before the edit still succeeds → AC-11, AC-14
- [ ] A To check item 50 minutes before its first slot reads "Starts in 50 min"; one that began reads "Started, not checked"; others "Sent N hr ago". Leave the list open a minute: the tag ticks → AC-16
- [ ] Keyboard only: reach the chip, the list items, every footer button and every step control; opening a step moves focus to its heading; Back returns focus to the button that opened it; destructive buttons are never the default focus → AC-20
- [ ] At 360 pixels wide: the list, the sheet and both steps have no sideways scroll, and every target is at least 44 pixels tall → AC-20

## Commands

- [x] `npm run check` → lint, format, typecheck and unit tests pass → AC-3, AC-9, AC-14, AC-16, AC-19
- [x] `DB_TESTS=1 npx vitest run supabase/tests/online_checks.test.ts` → 13 cases pass, including every AC-15 refusal (plain staff forbidden in all four functions, the guard refusing a direct cancel by plain staff and admin, a payment change after Confirm, and any `booking_id` change; no write grant on `booking` or `booking_event`) → AC-7, AC-8, AC-10 to AC-15, AC-18
- [x] `DB_TESTS=1 npx vitest run supabase/tests/online_booking_retention.test.ts` → passes with the restated purge functions → AC-18
- [x] `npx supabase db advisors --linked` → no new finding beyond the intended "authenticated may execute security definer" warning on the four decision functions → AC-15
- [ ] In PostHog live events, after one confirm, turn down, cancel and refund: `online_booking_confirmed { minutes_waiting }`, `online_booking_rejected` and `online_booking_cancelled { reason, refund_owed, was_confirmed }`, `online_booking_refund_settled { outcome }`, with no code, name, amount or URL → AC-19

## Value sourcing checks

- [x] Chip counts equal `select count(*) from booking where status = 'pending_check'` and `… where refund_status = 'owed'` on the linked project → chip
- [ ] A list item's amount and digits equal `booking.amount` and `booking.reference_last4`, never a sum of rows → list item, details sheet amount due
- [ ] A booking whose rows were retaken shows the retake's runs, not the lapsed hold's → list item runs
- [ ] With the device clock set an hour wrong, the time tags still read right (they count from the server's clock) → time tag
- [ ] All times read in Asia/Manila whatever the device's zone → details sheet, History, message first run
- [ ] `booking.decided_by` and `booking_event.staff_id` are the signed in admin's id after a decision, whatever the browser sent → confirm, turn down, cancel
- [ ] The Mark refunded amount recorded is the typed one, prefilled from `booking.amount` → Mark refunded

## Acceptance-criteria coverage

- AC-1 chip steps · AC-2 list steps · AC-3 code steps · AC-4 marker step · AC-5 live submit step · AC-6 three way sheet step · AC-7 confirm and plain staff steps, db tests · AC-8 turn down steps, db tests · AC-9 message step · AC-10 cancel and held steps, db tests · AC-11 contact edit step, db tests · AC-12 refund steps, db tests · AC-13 paid after hold step, db test · AC-14 race step, db test, unit tests · AC-15 db tests, advisors · AC-16 time tag step, unit tests · AC-17 screenshot steps · AC-18 retention db tests · AC-19 PostHog step, unit tests · AC-20 keyboard and 360 pixel steps
