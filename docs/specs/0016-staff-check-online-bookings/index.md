# 0016. Staff check of online bookings: a queue on the board, manager decisions, and refunds owed

**Date**: 2026-10-03 · amended 2026-10-04 (the check view names the payment method: AC-6)
**Status**: In Progress

## Summary

Every online booking now reaches the staff board live. A "To check" chip on the toolbar opens a list of the bookings still waiting for their payment check, plus any refunds the venue owes. Anyone on staff can open a booking and see its screenshot, amount and reference digits. Only an owner, admin or superadmin can confirm the payment, turn it down with a reason, or cancel the booking, and each of those steps offers a ready to send text to the player. Every decision is written by a Postgres function that checks the role itself (staff have no direct write on the booking at all), is guarded by the booking's `version`, and leaves a line in a small history table, so the venue always knows who decided what and which refunds are still owed.

## Requirements

**User stories**

- As a manager on shift, I want every unchecked online booking in one list, soonest first, so that none gets played before anyone checks the money.
- As a manager, I want to see the screenshot beside the amount due and the reference digits, so that I can match it against the venue's GCash or bank app in seconds.
- As a manager turning a payment down, I want a ready worded text to the player, so that I keep the booking rule's promise to message them first.
- As desk staff, I want to see where any online booking stands, screenshot included, so that I can answer a player at the counter even though I cannot decide it.
- As Ella, I want every refund the venue owes tracked until it is paid back, so that no player who paid is forgotten.
- As Ella, I want to know who confirmed, turned down or cancelled each booking and why, so that I can trust the check and settle disputes.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable)

- **AC-1**: **The chip.** The staff board toolbar on `/staff` shows a chip to every active staff member, on every day shown: "To check · N", where N counts bookings with `status = 'pending_check'` on any day, past or future. When any booking has `refund_status = 'owed'` the chip adds "· N refund" ("refunds" when more than one). With nothing to check and no refund owed it stays visible, muted, reading "All checked" with a check icon. The count is a word as well as a number, never colour alone. Pressing the chip opens the list (AC-2).
- **AC-2**: **The list.** A `BoardSheet` titled "Online bookings" with the code search (AC-3) at the top, then two sections. **To check**: `pending_check` bookings, sorted by the earliest `starts_at` among the booking's rows with `status = 'active'`, earliest first (so a started one sits on top). **Refunds owed**: `refund_status = 'owed'` bookings, sorted by `submitted_at`, oldest first. Each item shows the customer name, the code (`XXXX-XXXX`), the first run ("Court 2 · Fri 30 Oct · 6pm to 8pm", plus "+N more" when the booking has more runs), the amount, "Ending 1234", and a time tag (AC-16) or, under Refunds owed, "Refund ₱1,000" and the booking's state. Pressing an item opens the booking's details sheet (AC-6), whatever day the board is on. Each section shows at most 50 items, with "Showing the first 50" under a section that has more. An empty section reads "Nothing waiting." Loading shows a skeleton; a failed read shows one notice with Try again.
- **AC-3**: **Find by code.** A field labelled "Find by booking code" accepts 8 characters from the code alphabet, with or without the dash and in any case, and searches only once 8 valid characters are typed (no partial matching, no listing). A match in any state (held, unchecked, confirmed, turned down, cancelled, expired) opens its details sheet. No match reads "No online booking with that code." An invalid entry reads "A code is 8 letters and numbers, like K7MQ-3XPT."
- **AC-4**: **The board marker.** A booked cell whose row has a `booking_id` shows a globe icon beside the customer name caption. While the booking is `held` the caption adds "Held". While it is `pending_check` the caption adds "Check payment". Once it is `confirmed` only the globe shows. The cell's colours and the seven views of spec 0003 do not change. The cell's accessible name adds "online booking" and, when unchecked, "payment not yet checked". The staff day read returns each row's booking status for this.
- **AC-5**: **Live.** A trigger on `booking` sends `booking_changed` with payload `{ id }` and nothing else on the `schedule` topic on insert, and on update only when `status` or `refund_status` is distinct from its old value (the trigger's `when` clause), so the nightly purges and contact copies send nothing. The staff board refetches the chip, the list and the day on that event (and on `reservation_changed`, as today). The public board and the landing page ignore it. When a booking id enters `pending_check` that the board has not seen before (never on first load; staff never move a booking into `pending_check`, so every such change is a player's), a toast reads "New online booking to check: Court 2, Fri 30 Oct, 6pm" with an Open button that opens its details sheet. There is no sound. The same booking never toasts twice in one tab.
- **AC-6**: **The details sheet.** The Online booking block (spec 0015, AC-21) grows into the full check view, the same from a cell, the list or a code search. It shows: the state badge (Held, not yet paid · Payment not yet checked · Payment confirmed · Payment turned down · Cancelled · Expired); the refund line when `refund_status` is set ("Refund owed ₱1,000", "Refunded ₱1,000 on Sat 31 Oct by Ana", "No refund needed"); the code; "Amount due ₱1,000" from `booking.amount`; "Method GCash transfer" (amended 2026-10-04); "Ending 1234"; the screenshot (AC-17); the customer name, phone and email; the time it was sent in `Asia/Manila`; every run ("Court 2 · Fri 30 Oct · 6pm to 8pm"); and **History**, one line per `booking_event`, newest first ("Turned down by Ana · Sat 31 Oct, 9:05am · Amount doesn't match", with the note under it when there is one). Every active staff member sees all of this. A cleared field reads "Cleared".
- **AC-7**: **Confirm.** For an owner, admin or superadmin, a `pending_check` booking shows a "Confirm payment" button. One press calls `confirmOnlineBooking`, and in one transaction the booking becomes `confirmed` with `decided_at`, `decided_by`, `changed_by` and `version + 1`; every active row of the booking gets `payment_status = 'paid'`; and one `booking_event` of kind `confirmed` is written. The sheet then shows the new state and the chip count drops on every open board. Plain staff see no decision buttons, only the line "Only an owner or admin can confirm or turn down a payment."
- **AC-8**: **Turn down.** For an owner, admin or superadmin, a `pending_check` or `confirmed` booking shows "Turn down payment". It opens a step with: a required reason from `REJECT_REASONS` (No payment found · Amount doesn't match · Reference doesn't match · Screenshot isn't a valid payment · Other); a note (up to 200 characters, required for Other); the checkbox "Money was received, a refund is owed", ticked by default for Amount doesn't match and Reference doesn't match and unticked for the rest; the message panel (AC-9); and a destructive "Turn down" button. Pressing it calls `rejectOnlineBooking`, and in one transaction the booking becomes `rejected` with `decided_at`, `decided_by`, `changed_by`, `version + 1` and `refund_status = 'owed'` when the box is ticked (otherwise unchanged); every active row of the booking that has not yet ended is cancelled with `changed_by` set to the deciding staff member (so `cancelled_by` is stamped, the row shows in the usage report's day list as a staff cancel, and the slots read Available on both boards); and one `booking_event` of kind `rejected` records the reason, note and `refund_owed`. A turned down booking is final: it shows no Confirm, Turn down or Cancel again, only the refund buttons when a refund is owed (AC-12).
- **AC-9**: **The message to the player.** The turn down and cancel steps show a message panel: an editable text box prefilled from `PLAYER_MESSAGES` for the chosen reason, with the player's first name (the first word of the trimmed `customer_name`, or the whole name when it is one word), the code, the first run ("Fri 30 Oct, 6pm"), and, when the refund box is ticked, "We'll send ₱1,000 back to the account you paid from." The text follows the reason and the box until staff edit it, then it stays as typed. Under it: "Text the player" (an `sms:` link to `booking.customer_phone` with the text as its body, shown only while a phone is on file) and "Copy message" (to the clipboard, with "Copied" confirmed for 2 seconds, for Messenger), and the player's email, which can be selected and copied. The panel reads "Message the player before you turn this down." for a turn down, and "Message the player before you cancel." for a cancel. The app does not store the message or record whether it was sent.
- **AC-10**: **Cancel an online booking.** On a row with a `booking_id` whose booking is `pending_check` or `confirmed`, the details sheet's "Cancel booking" is shown only to an owner, admin or superadmin, and it cancels the whole booking, never one row. It opens a step with a required reason from `CANCEL_REASONS` (Player asked to cancel · Payment reversed or disputed · Venue issue (court closed, weather) · Other); a note (required for Other); the refund checkbox, ticked by default when the booking is `confirmed` and unticked when it is `pending_check`; the message panel (AC-9); and a destructive "Cancel booking" button. Pressing it calls `cancelOnlineBooking`, which acts as AC-8 but sets status `cancelled` and writes a `cancelled` event. Plain staff see no Cancel on an online row. On a `held` row the sheet shows no Cancel, and reads "Held for checkout. It frees itself within 5 minutes if not paid." A booking already `rejected`, `cancelled` or `expired` has no row left on the board ahead of now; a row that had already ended when it was turned down stays as played, and its sheet shows the booking's state with no Cancel. Postgres refuses any other path that cancels a row of a `held`, `pending_check` or `confirmed` booking (AC-15).
- **AC-11**: **Edit an online row.** Any active staff member may edit an online row's court, time, name, phone and note as with any booking (the existing rules, including the ended row rule, still apply). The edit sheet hides the payment and amount fields on an online row, and Postgres keeps `amount`, `payment_status` and `booking_id` of an online row unchanged outside the decision functions. A name or phone edit is copied by the database to the booking and to its other active rows, so the list, the message and every cell agree; the copy sets the booking's `changed_by` and `updated_at` but not its `version`, so a contact fix never makes a manager's pending decision come back stale. The booking's `amount` stays what was paid when a run moves or changes length. `booking_id` never changes after insert, on any row (a desk row cannot be attached to an online booking later). A refused change answers `invalid` with "This is an online booking. Use its own buttons in the sheet."
- **AC-12**: **Refunds owed.** A booking with `refund_status = 'owed'` shows under Refunds owed and in its sheet. For an owner, admin or superadmin it offers "Mark refunded" (an amount prefilled with `booking.amount`, more than 0 and up to 99,999.99, and an optional note) and "No refund needed" (a required note, for example "No money arrived"). Mark refunded calls `settleOnlineRefund` with outcome `refunded` and sets `refund_status = 'refunded'`, `refund_amount`, `refunded_at` and `refunded_by`, with a `refunded` event carrying the amount and note. No refund needed sets `refund_status = 'not_owed'` with a `refund_not_owed` event carrying the note. Each is guarded by `version` and sets `changed_by`, and both are final.
- **AC-13**: **Paid after the hold, slot lost.** When a booking's `submitted_at` is set while its status stays `expired` (spec 0015, AC-13), a trigger sets `refund_status = 'owed'` in the same write. The migration backfills every existing `expired` booking with a `submitted_at` and no `refund_status`. These show under Refunds owed with the state "Expired, paid after the hold" and only the refund buttons.
- **AC-14**: **Somebody got there first.** Every decision and refund call sends the booking's `version`. If the version has moved, or the booking's state no longer allows the step (for example Confirm on a booking just turned down), nothing is written and the sheet shows "Someone else just updated this booking. Here's where it stands now." with the fresh state read again, never a silent no op. A turn down, cancel or refund step sends the `version` the booking had when the step opened, not a newer one a live read brought in while the step was open; so another board's decision in the meantime comes back as this message, never as a second decision on top of it. A `stale` or `wrong_state` answer closes the step, so acting again means opening it afresh on the booking just read. A double press sends one call, because the button is disabled while it runs.
- **AC-15**: **Postgres enforces who decides.** `authenticated` gains no write grant on `booking` and none on `booking_event` (which active staff may read). The four decision functions are the only staff write path; each is `security definer` and refuses unless `private.is_owner()` passes (owner, admin, superadmin), so a plain staff token calling one directly writes nothing and gets `forbidden`, and no token can change a booking's state without leaving its event. `booking_event` is never updated or deleted (the retention job's note clear aside, AC-18). A trigger on `reservation` refuses, whatever the caller, to cancel a row or change its `payment_status` or `amount` while its booking is `held`, `pending_check` or `confirmed`, unless a decision function has marked that booking for this transaction (Decision, the row guard). So the only way to end such a booking, or to mark its rows paid, is through its function. The refusal raises SQLSTATE `23514` with a message starting `online_booking_guard:`, which `describeDatabaseError` maps to `invalid`. `anon` gains no grant, and `booking_changed` carries only the id. A database test shows each refusal.
- **AC-16**: **Started, not checked.** A To check item's time tag reads "Starts in 25 min" from 60 minutes before its earliest active slot (the earliest `starts_at` among rows with `status = 'active'`), "Started, not checked" once that slot has begun, and "Sent 2 hr ago" otherwise (from `submitted_at`). The tag is worked out against the server's `now` returned with the read, ticking each minute in the browser. Nothing is confirmed or cancelled automatically.
- **AC-17**: **The screenshot.** In the details sheet, a thumbnail sits beside the amount and digits, loaded from a signed URL that lasts 5 minutes, made for that booking's `proof_path` with the staff member's own token through `getProofUrl`. Pressing it opens a full screen dialog with the image fitted to the screen, pinch zoom on touch, a close button and Escape, and alt text "Payment screenshot for booking K7MQ-3XPT". A URL is asked for again when the sheet reopens or the dialog opens after it lapsed. With `proof_path` null it reads "Screenshot deleted" (the purge, spec 0015, AC-23). A failed load shows "The screenshot did not load." with Try again. No URL is ever written into the page's HTML, a log or an analytics event.
- **AC-18**: **Retention follows refunds.** `payment_proofs_due()` gains one top level condition, `refund_status is distinct from 'owed'`, around all three of its branches, so no screenshot is deleted while its refund is owed (a paid after hold booking with no decision included). Its decided branch then counts 30 days from the later of `decided_at` and `refunded_at`, and a booking with `refunded_at` but no `decided_at` (paid after the hold) is due 30 days after `refunded_at`. Spec 0015, AC-23 is otherwise unchanged. `purge_online_booking_details()` also clears `booking_event.note` when it clears the booking's email and digits (90 days after the last slot ends). `/privacy` gains one sentence saying staff notes on a payment decision are cleared with the other booking details. The retention numbers stay the constants in `lib/legal/constants.ts`.
- **AC-19**: **Analytics.** After each successful write, and never awaited, the action sends one event through `captureStaffEvent()`: `online_booking_confirmed` `{ minutes_waiting }` (from `submitted_at` to the decision, whole minutes), `online_booking_rejected` `{ reason, refund_owed, was_confirmed }`, `online_booking_cancelled` `{ reason, refund_owed, was_confirmed }`, and `online_booking_refund_settled` `{ outcome: "refunded" | "not_owed" }`. Each is added to the allow list in `lib/analytics/properties.ts` with a `.strict()` schema and carries no personal data, code or amount. `stale`, `wrong_state` and `forbidden` results are logged with `console.warn` only. Unexpected failures go through `reportFailure()`.
- **AC-20**: **Look and access.** Built to `docs/design.md` with the staff board's existing `BoardSheet`, `Badge`, `Button` and confirm dialog, Phosphor icons. Every control is reachable and usable from the keyboard, every target is at least 44 pixels tall, the list, the sheet and both steps work at 360 pixels wide with no sideways scroll, and state never relies on colour alone. Opening a step moves focus to its heading; closing it returns focus to the button that opened it. The destructive buttons use the destructive variant and are never the default focus.

## Decision

**Chosen option**: Option 2: A check queue on the staff board, decisions written only by Postgres functions that check the role themselves, with a `booking_event` history and refund tracking on `booking`.

The board stays the one screen staff use. Postgres decides who may confirm, turn down, cancel and settle refunds, keeps every decision in the history, and keeps the booking and its rows in step whichever path tries to change them.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `zod` (`pproenca/dot-skills`, `.agents/skills/zod/`) · `shadcn` (`shadcn/ui`, `.agents/skills/shadcn/`) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `playwright-cli` (`microsoft/playwright-cli`, `.agents/skills/playwright-cli/`)

Settled while writing (each with its runner up):

- **Where the code lives**: a new `lib/online-checks/` with `actions.ts` (`"use server"`, `import "server-only"`; every action calls `requireStaff()`, then Zod, then the function), `queries.ts` (`server-only`), and the pure `constants.ts` (the reason lists and labels) and `messages.ts` (`PLAYER_MESSAGES` and the builder), which the Client Components import. Components go in `components/staff/online-checks-*.tsx`, and `online-booking-block.tsx` grows in place. Runner up: adding to `lib/schedule/actions.ts`, which is already over 700 lines and is about the grid, not money.
- **The writes are `security definer` functions with the owner check inside, and `authenticated` keeps no write grant on `booking` or `booking_event`.** Each decision changes several rows in one transaction (booking, its rows, an event), so it must be one function. Each function's first statement refuses unless `private.is_owner()` passes (answering `forbidden`), then works with `set search_path = ''`. Postgres stays the enforcement point, as the project rule requires, and because no role can update `booking` or insert an event directly, invariant 5 (every decision leaves exactly one event) cannot be skipped. This is the pattern spec 0015's functions and `court_usage` already use. Runner up: `security invoker` functions under an owner update policy on `booking`, which keeps the check in a policy but lets an owner's token update `booking` directly through the API, skipping the event.
- **Each function answers `jsonb`** (`{ ok: true, version, previous_status, submitted_at }` or `{ ok: false, reason }`; the action works out `was_confirmed` and `minutes_waiting` for AC-19 from the success answer, never from an earlier read, with `reason` one of `stale`, `wrong_state`, `forbidden`, `not_found`, `invalid`), the same shape as spec 0015's functions. It reads the booking `for update` first, compares `version` and state, then writes. Runner up: raising coded exceptions, which PostgREST flattens into a message to parse.
- **A row guard trigger with a transaction flag, not app routing alone**: `guard_online_reservation()` (BEFORE UPDATE on `reservation`, `security definer`, `search_path = ''`). Each decision function's first write is `perform set_config('online_checks.decision', <booking id>::text, true)` (local to the transaction, gone at commit). On an update to a row with a `booking_id`, the trigger refuses a change to `status` (to `cancelled`), `payment_status` or `amount` unless the flag equals that row's `booking_id`, or the booking is no longer `held`, `pending_check` or `confirmed` (the second case is what spec 0015's expiry needs; its shared `private.expire_online_booking()` already updates the booking before its rows and needs no restating). It refuses any change to `booking_id` on every row, so a link is set only at insert. It is BEFORE UPDATE only: spec 0015's hold and retake insert rows and never pass through it. The refusal raises SQLSTATE `23514` with a message starting `online_booking_guard:`, and `describeDatabaseError` gains a mapping from that to `invalid`. Rereading `booking.status` alone would not do: after Confirm the status is still `confirmed`, so it could not tell the function's own write from a later direct `payment_status` change by plain staff. This is what makes "cancels the whole booking" and invariant 7 true for every caller. Runner up: hiding Cancel in the app only, which a direct API call skips.
- **Contact edits flow to the booking**: the same trigger, on a name or phone change to an online row, writes the new values to the booking (setting `changed_by` and `updated_at`, not `version`) and to its other active rows, guarded by `pg_trigger_depth()` so the sibling updates do not copy again. The siblings' own broadcast and audit triggers fire as for any row update. Runner up: locking name and phone on online rows, which the engineer chose against.
- **The details sheet owns the online footer.** `DetailsSheet` loads the `StaffBooking` itself (through `loadStaffBooking`, keyed by `booking_id` and refetched on the row's `changedAt` and on `booking_changed` for that id), passes it down to `OnlineBookingBlock` (now body only, no fetch of its own), and builds the footer for an online row from `canDecide` and the state: Confirm payment, Turn down payment and Cancel booking (`pending_check`), Turn down payment and Cancel booking (`confirmed`), Mark refunded and No refund needed (`refund_status = 'owed'`), with Edit beside them for any active staff. Desk rows and closures keep today's footer. Runner up: a render prop from the block into the footer, which splits one booking's state across two components.
- **Online rows never use the board's row cancel.** The board's existing `confirming` state and `cancelReservation` call stay for desk bookings and closures only. An online booking's steps run on a new sheet state, `step: "turn_down" | "cancel" | "refund" | null`, inside the same `BoardSheet`, each with its own form and pending flag. A step keeps the booking's `version` from the moment it opened and sends that one, even when a live read lands while it is open, so a decision is never made on a state the manager did not see (AC-14). The step's form state (reason, note, refund box, edited message) lives in the step itself, so a live reload of the booking underneath leaves what the manager typed in place. Runner up: widening `confirmCancel`, which mixes a yes or no dialog with a four field form.
- **Which rows stand for a booking in the list and the toast.** A `pending_check` or `confirmed` booking uses its rows with `status = 'active'`. A `rejected`, `cancelled` or `expired` booking (under Refunds owed, or found by code) uses the rows sharing its latest `created_at` (its last insert batch, so a retake's rows win over the first hold's), whatever their status. Runner up: every row ever linked, which shows a lapsed hold's slots twice.
- **Only rows not yet ended are cancelled** by a turn down or cancel. A slot already played stays in the usage history as it happened, and the booking's state tells the money story. Runner up: cancelling every row, which rewrites past court usage.
- **The paid after hold refund is a trigger on `booking`**, not a restated `submit_online_booking`: a BEFORE UPDATE trigger sets `refund_status = 'owed'` when `submitted_at` goes from null to set while `status` stays `expired`. That leaves spec 0015's long function untouched. Runner up: restating the function, which risks the hold, retake and race logic for a one line change.
- **The broadcast carries only `{ id }`** on the existing `schedule` topic, which `anon` may read; an id says nothing personal and the public boards ignore the event. Runner up: a staff only private topic, which needs a new realtime policy and a second channel on the staff board for no privacy gain.
- **The held row caption reads "Held"**, so staff never see "Check payment" on a checkout that is still in progress. Runner up: no caption while held, which leaves a booked cell with a globe and no clue why it may vanish.
- **Message wording**: `PLAYER_MESSAGES` in `lib/online-checks/messages.ts`, one per reason, pending Ella's approval (Follow-up). Each opens "Hi {firstName}, this is Ella's Pickle Court about your booking {code} ({firstRun})." Then, by reason: No payment found: "We couldn't find your payment, so we've cancelled the booking and freed the slots. If you did pay, reply with your receipt and we'll sort it out." · Amount doesn't match: "The amount we received doesn't match the ₱{amount} due, so we've cancelled the booking." · Reference doesn't match: "We couldn't match your payment's reference number, so we've cancelled the booking." · Screenshot isn't a valid payment: "The screenshot you sent doesn't show a completed payment, so we've cancelled the booking. If you did pay, reply with your receipt and we'll sort it out." · Player asked to cancel: "As you asked, we've cancelled your booking." · Payment reversed or disputed: "Your payment was reversed, so we've cancelled the booking." · Venue issue: "We're sorry, we've had to cancel your booking because of a problem at the venue." · Other: "We've had to cancel your booking. Message us if you have any questions." The refund line follows when the box is ticked. The message is editable before it is sent. Runner up: fixed, uneditable text, which cannot cover Other.
- **The `sms:` link** uses `?body=`, the form `smsHref()` in `lib/venue.ts` already uses. A new `smsToHref(phone, body)` sits beside it rather than widening `smsHref`, which is the venue's own number.
- **The list is capped at 50 per section, not paged.** A small venue rarely has more than a handful waiting; the cap keeps the read bounded, and the "Showing the first 50" line says so. Runner up: cursor pagination, which costs a control nobody will press.
- **The chip and list read is one server function**, `getOnlineChecks()`, refetched on the live events, not a separate count query. Runner up: a count on every day read, which repeats the work on every day switch.

## Feature design

**Data model sketch**

`booking` (changed, four new columns; everything else as spec 0015):

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `refund_status` | text | yes | `owed`, `refunded`, `not_owed` (check). Null means no refund question applies. |
| `refund_amount` | numeric(10,2) | yes | more than 0 (check); set only with `refund_status = 'refunded'` |
| `refunded_at` | timestamptz | yes | not null exactly when `refund_status = 'refunded'` (check) |
| `refunded_by` | text | yes | FK `staff.user_id`, indexed; not null exactly when `refunded_at` is |
| `decided_at`, `decided_by` | existing | | now written: the latest confirm, turn down or cancel |
| `version`, `changed_by` | existing | | every staff write bumps `version` and sets `changed_by` |

New index: `(status, id) where status = 'pending_check'` and `(refund_status, id) where refund_status = 'owed'`, for the two list sections.

`booking_event` (new, append only):

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | bigint identity | no | PK |
| `booking_id` | bigint | no | FK `booking.id`, indexed with `created_at` |
| `kind` | text | no | `confirmed`, `rejected`, `cancelled`, `refunded`, `refund_not_owed` (check) |
| `reason` | text | yes | for `rejected`: `no_payment`, `amount_mismatch`, `reference_mismatch`, `invalid_proof`, `other`; for `cancelled`: `player_asked`, `payment_reversed`, `venue_issue`, `other`; null for every other kind (one check per kind) |
| `note` | text | yes | 1 to 200 characters after trim (check); required when `reason = 'other'` and for `refund_not_owed` (check); cleared by the 90 day purge |
| `refund_owed` | boolean | yes | not null exactly for `rejected` and `cancelled` (check) |
| `amount` | numeric(10,2) | yes | more than 0; not null exactly for `refunded` (check) |
| `staff_id` | text | no | FK `staff.user_id`, indexed |
| `created_at` | timestamptz | no | default `now()` |

Grants: `select` to `authenticated`, with a policy for active staff (`private.is_active_staff()`). No `insert`, `update` or `delete` to `authenticated` or `anon`; only the decision functions (as the table owner) and the retention job write it. RLS on.

`reservation`: no new columns. The `guard_online_reservation()` trigger (Decision) is added.

Storage: a new select policy on `storage.objects` for `authenticated`: bucket `payment-proof` and `private.is_active_staff()`, so a staff token can make a signed URL.

Relationships: `booking` 1:N `booking_event`; `booking` 1:N `reservation` (unchanged); `staff` 1:N `booking_event` (as decider) and 1:N `booking` (as `refunded_by`, `decided_by`).

**State transitions**

```
booking.status (staff transitions are new; the rest is spec 0015)
  held          → pending_check | expired              spec 0015
  expired       → pending_check                        spec 0015 retake
  pending_check → confirmed                            Confirm payment       (owner, admin, superadmin)
  pending_check → rejected                             Turn down payment     (owner, admin, superadmin)
  pending_check → cancelled                            Cancel booking        (owner, admin, superadmin)
  confirmed     → rejected | cancelled                 as above
  rejected, cancelled, expired                         final

booking.refund_status
  null  → owed       turn down or cancel with the box ticked; or submitted while expired (trigger)
  owed  → refunded   Mark refunded
  owed  → not_owed   No refund needed
  refunded, not_owed final
```

Rows: on `confirmed` every active row gets `payment_status = 'paid'`. On `rejected` or `cancelled` every active row not yet ended becomes `cancelled`.

**API surface**

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
| --- | --- | --- | --- | --- | --- |
| `getOnlineChecks()` (`lib/online-checks/queries.ts`) | server read | none | `toCheck[]`, `refundsOwed[]` (each: `bookingId`, `code`, `customerName`, `amount`, `referenceLast4`, `status`, `refundStatus`, `submittedAt`, `runs[]`), `toCheckCount`, `refundCount`, `more: { toCheck, refunds }`, `serverNow` | active staff (`requireStaff()`, RLS) | `failed` |
| `refreshOnlineChecks()` (`lib/online-checks/actions.ts`) | Server Action | none | as above | active staff | `failed` |
| `findOnlineBooking` | Server Action | `code: string` (8 alphabet characters after removing the dash and uppercasing) | `{ bookingId }` | active staff | `not_found`, `invalid` |
| `loadStaffBooking` (existing, widened) | Server Action | `bookingId` | `StaffBooking` plus `amount`, `customerName`, `customerPhone`, `refundStatus`, `refundAmount`, `refundedAt`, `refundedByName`, `hasProof`, `runs[]`, `events[]` (kind, reason, note, amount, staff name, at), `version`, `canDecide` | active staff | `not_found`, `failed` |
| `getProofUrl` | Server Action | `bookingId` | `{ url, expiresAt }` | active staff; signed with the staff token | `not_found` (no proof), `failed` |
| `confirmOnlineBooking` | Server Action | `bookingId`, `version` | `{ version }` (the action keeps `previous_status` and `submitted_at` for the event) | owner, admin, superadmin (checked in the function) | `stale`, `wrong_state`, `forbidden`, `invalid`, `failed` |
| `rejectOnlineBooking` | Server Action | `bookingId`, `version`, `reason` (`REJECT_REASONS`), `note?`, `refundOwed: boolean` | `{ version }` | as above | as above |
| `cancelOnlineBooking` | Server Action | `bookingId`, `version`, `reason` (`CANCEL_REASONS`), `note?`, `refundOwed: boolean` | `{ version }` | as above | as above |
| `settleOnlineRefund` | Server Action | `bookingId`, `version`, `outcome: "refunded" \| "not_owed"`, `amount?` (required for refunded), `note?` (required for not_owed) | `{ version }` | as above | as above |
| `public.confirm_online_booking(p_booking_id bigint, p_version integer)` | RPC, `security definer`, `search_path = ''` | | `jsonb`: `{ ok, version, previous_status, submitted_at }` | `authenticated`; the function refuses all but owners | refusals as `jsonb` |
| `public.reject_online_booking(p_booking_id bigint, p_version integer, p_reason text, p_note text, p_refund_owed boolean)` | RPC, as above | | `jsonb` | as above | |
| `public.cancel_online_booking(p_booking_id bigint, p_version integer, p_reason text, p_note text, p_refund_owed boolean)` | RPC, as above | | `jsonb` | as above | |
| `public.settle_online_refund(p_booking_id bigint, p_version integer, p_outcome text, p_amount numeric, p_note text)` | RPC, as above | | `jsonb` | as above | |
| `public.booking_broadcast()` | trigger, AFTER INSERT, and AFTER UPDATE `when (old.status is distinct from new.status or old.refund_status is distinct from new.refund_status)`, on `booking` | | `booking_changed { id }` on `schedule` | `security definer` | |
| `public.booking_refund_owed_on_late_submit()` | trigger, BEFORE UPDATE on `booking` | | sets `refund_status` | | |
| `public.guard_online_reservation()` | trigger, BEFORE UPDATE on `reservation` | the `online_checks.decision` transaction setting | raises on a refused change; copies contact edits | `security definer` | SQLSTATE `23514`, message `online_booking_guard: …`, mapped to `invalid` |
| `public.payment_proofs_due()`, `public.purge_online_booking_details()` | restated | | | as spec 0015 | |
| `getStaffSchedule` (`lib/schedule/queries.ts`, widened) | server read | | each row gains `bookingStatus` (from `booking.status` by `booking_id`) | active staff | |

Every Server Action returns the project's `ActionResult`; a `stale` or `wrong_state` result makes the sheet call `loadStaffBooking` again (AC-14). Confirm sends the `version` on screen when it is pressed; a step sends the `version` from when it opened.

**Value sourcing**

| Action | Value produced / displayed | Source |
| --- | --- | --- |
| Chip | to check count, refund count | `getOnlineChecks()`: count of `booking.status = 'pending_check'`, count of `refund_status = 'owed'` |
| List item | name, code, amount, digits | `booking.customer_name`, `code` (shown through `formatBookingCode()`), `amount` (`formatPeso()`), `reference_last4` |
| List item | first run, "+N more" | the rows that stand for the booking (Decision: active rows while `pending_check` or `confirmed`, else the rows sharing its latest `created_at`), merged into runs as `lib/booking` does, labelled with the court names, `formatDayHeading` and the slot labels in `venue_settings.timezone`, ends through `localEndTimeInZone()` |
| List order | earliest first slot | `min(reservation.starts_at)` over the booking's rows with `status = 'active'`; refunds by `booking.submitted_at` |
| Time tag | "Starts in N min", "Started, not checked", "Sent N hr ago" | first slot start and `submitted_at` against `serverNow` from the read plus the time since it arrived |
| Code search | the match | `booking.code` equals the input with the dash removed and uppercased; the alphabet from spec 0015, AC-18 |
| Board marker | globe and caption | `bookingStatus` on each staff row, from `booking.status` |
| Toast | court, day, time | the new booking's first run from the refetched `getOnlineChecks()` list; "new" is a booking id in `toCheck` that was not in the previous answer and was not just written by this tab |
| Details sheet | state, refund line, history | `booking.status`, `refund_status`, `refund_amount`, `refunded_at`, `refunded_by` (joined to `staff` for the name), `booking_event` rows joined to `staff` for each name, times in `Asia/Manila` |
| Details sheet | amount due | `booking.amount` (never recomputed) |
| Details sheet | method | `PAYMENT_METHOD_LABEL` ("GCash transfer") in `lib/booking/constants.ts`, the same words as the player's receipt; every online booking is paid this one way, so nothing is stored per booking |
| Details sheet | which buttons show | `canDecide` from `private.is_owner()` read with the staff token, plus the booking's state; Postgres still decides on write |
| Screenshot | the image | `booking.proof_path`, signed by `storage.from("payment-proof").createSignedUrl(path, 300)` on `staffSupabase()` |
| Turn down, cancel | reason labels, default refund tick | `REJECT_REASONS`, `CANCEL_REASONS` and `REFUND_DEFAULT` in `lib/online-checks/constants.ts` (ticked for `amount_mismatch`, `reference_mismatch`, and for a cancel of a `confirmed` booking) |
| Message | text | `PLAYER_MESSAGES[reason]` with the first name (the first whitespace separated word of the trimmed `booking.customer_name`, or all of it when it is one word), the code, the first run, and `booking.amount` for the refund line |
| Message | phone, email | `booking.customer_phone` (the `sms:` link through `smsToHref()`), `booking.customer_email` |
| Confirm, turn down, cancel | `decided_at`, `decided_by`, `changed_by` on the booking and on every row it changes | `now()` and `auth.jwt() ->> 'sub'` inside the function, never from the browser |
| Guard trigger | which booking a function may change | the `online_checks.decision` setting, set by the function with `set_config(…, true)` |
| Mark refunded | amount | the input, prefilled in the form with `booking.amount` |
| Analytics | `minutes_waiting` | the function's success answer: its `submitted_at` against the decision time, in whole minutes, worked out by the action |
| Analytics | `was_confirmed` | `previous_status = 'confirmed'` in the function's success answer |
| Retention | when a proof is due | `decided_at`, `refunded_at`, `refund_status` in `payment_proofs_due()`; the 30 and 90 day numbers from `lib/legal/constants.ts`, pinned equal to the SQL by the existing test |

**Key invariants**

1. Only an owner, admin or superadmin changes a booking's `status` or `refund_status` from the staff side, and only through the four functions: `authenticated` has no write grant on `booking` or `booking_event`, and each function checks `private.is_owner()` first.
2. A booking that is `held`, `pending_check` or `confirmed` has none of its rows cancelled except through its own status change in the same transaction (the guard trigger).
3. A `rejected` or `cancelled` booking has no active row that ends in the future.
4. A `confirmed` booking's active rows all read `payment_status = 'paid'`.
5. Every staff status or refund change writes exactly one `booking_event`, bumps `version` and sets `changed_by`; a write against an old `version` changes nothing.
6. `refunded_at`, `refunded_by` and `refund_amount` are set exactly when `refund_status = 'refunded'`.
7. An online row's `amount` and `payment_status` change only inside a decision function for its own booking (the transaction flag); `booking_id` never changes after insert on any row; an online row's name and phone always match its booking's.
7a. Every row a turn down or cancel cancels carries the deciding staff member in `changed_by`, so `cancelled_by` is set and the usage report treats it as a staff cancel, never as a system expiry.
8. A screenshot is never deleted while its refund is owed.
9. `booking_changed` carries the id only; no email, digits, code, path or amount rides any broadcast.
10. Nothing decides by itself: no job confirms, turns down or cancels a booking.

**Security model**

- **Plain staff** (`role = 'staff'`, active) read every booking, its events and its screenshot, and may edit an online row's court, time, name, phone and note. They cannot confirm, turn down, cancel an online booking, or settle a refund; Postgres refuses each.
- **Owner, admin, superadmin** (`private.is_owner()`) do all of that, through the four functions only: there is no direct write grant on `booking` or `booking_event`, and the guard trigger refuses a direct cancel of their rows.
- **Signed URLs** for screenshots last 5 minutes, are made per request with the staff member's own 5 minute token, and are never stored, logged or sent to analytics.
- **Players and `anon`** gain nothing. The `online_booking` role gains nothing.
- **Compliance scope**: the Philippine Data Privacy Act of 2012. The payment screenshot can show a name, number or balance, and every active staff member can open it (the engineer's choice). Every decision is audited by `booking_event` (who, when, why) and row changes by the existing `reservation_audit`. Staff notes are cleared with the booking's other details at 90 days (AC-18).

**Configuration required**

None. No new environment variable, secret or service.

**Critical test scenarios**

- Happy path: a player submits in a signed out browser; within the live delay the chip on a second, signed in board reads "To check · 1", the toast offers Open, the cell shows the globe and "Check payment"; an admin opens the screenshot, presses Confirm payment; the chip drops to "All checked", the rows read Paid, History reads "Confirmed by …", verifies **AC-1**, **AC-2**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-17**
- Turn down with refund: an admin picks Amount doesn't match (box ticked by default), copies the message, turns it down; the slots read Available on `/` and `/staff`; the booking appears under Refunds owed; Mark refunded with ₱500 clears it and History shows both lines, verifies **AC-8**, **AC-9**, **AC-12**
- Cancel a confirmed booking: Cancel on one of two rows cancels both, asks a reason, defaults the refund box ticked, verifies **AC-10**
- Race: two admins confirm and turn down the same booking at once; exactly one writes, the other sees "Someone else just updated this booking" and the fresh state, verifies **AC-14**
- Auth: a plain staff token calling each function directly gets `forbidden` and changes nothing; a plain staff (and an admin) `update reservation set status = 'cancelled'` on a row of a `pending_check` booking is refused by the guard; plain staff see no decision buttons but do see the screenshot; the anon key cannot read `booking_event` or a proof, verifies **AC-15**, **AC-7**, **AC-17**
- Paid after the hold: a spec 0015 retake that fails leaves the booking `expired` with `refund_status = 'owed'`, and it lists under Refunds owed, verifies **AC-13**
- Guard: after Confirm, a plain staff `update reservation set payment_status = 'unpaid'` on one of its rows is refused with `online_booking_guard:`; `update reservation set booking_id = …` on a desk row is refused; a deliberately wrong ordered test function that cancels rows without setting the flag is refused, verifies **AC-11**, **AC-15**
- Edit racing a decision: a plain staff phone edit on one row, then an admin's Confirm with the version read before it, succeeds (the contact copy does not bump `version`), verifies **AC-11**, **AC-14**
- Edit: moving an online row an hour later keeps its amount and Paid state; changing its phone changes the booking's phone and the sibling row's, verifies **AC-11**
- Retention: a rejected booking with a refund owed keeps its proof past 30 days, and a paid after hold booking with a refund owed keeps it past 90 days after its last slot; once refunded, it is due 30 days after `refunded_at`; the 90 day purge clears event notes, verifies **AC-18**
- Started, not checked: a booking whose first slot began 10 minutes ago sorts first and reads "Started, not checked", and nothing changes its state, verifies **AC-16**

## Build plan

Tracer Bullet: task 1 proves one real check end to end (a player's submit, the live event, the chip, the screenshot through a staff signed URL, Confirm through a `security definer` function that checks the role, and both boards updating) before turn down, cancel or refunds are built. The one platform assumption, Storage honouring the staff token's select policy for a signed URL, is proven there.

1. **The thin thread: confirm.** Migration A: the four `booking` columns and their checks, `booking_event` with its checks, select grant and policy, the two partial indexes, the staff select policy on `payment-proof`, `confirm_online_booking`, and `booking_broadcast()`; `db advisors --linked` clean; types regenerated. `lib/online-checks/` with `getOnlineChecks()`, `refreshOnlineChecks`, `getProofUrl`, `confirmOnlineBooking`; the chip; the list with To check items only; the widened `loadStaffBooking` and the Online booking block with the screenshot thumbnail and Confirm. Proven live: a submit in a signed out browser raises the chip on a second signed in board, an admin opens the screenshot and confirms, the rows read Paid, and a plain staff token is refused by the function. Satisfies **AC-1**, **AC-2**, **AC-6**, **AC-7**, **AC-15** (the confirm side), **AC-17**
2. **Turn down, cancel and the message.** Migration B: `guard_online_reservation()` with the transaction flag (Decision), `set_config` added as the first write of `confirm_online_booking`, `reject_online_booking`, `cancel_online_booking`. `lib/online-checks/constants.ts` and `messages.ts`, `smsToHref()`, the turn down and cancel steps with the refund checkbox and message panel, `DetailsSheet` taking over the booking load and the online footer, the `step` state, Cancel on online rows routed to the whole booking and hidden from plain staff, Cancel hidden on held rows, and the `online_booking_guard:` mapping in `describeDatabaseError`. Satisfies **AC-8**, **AC-9**, **AC-10**, **AC-15**
3. **Refunds.** Migration C: `settle_online_refund`, `booking_refund_owed_on_late_submit()` and the backfill. The Refunds owed section, the refund line, Mark refunded and No refund needed. Satisfies **AC-12**, **AC-13**
4. **The board and the edges.** `bookingStatus` on the staff day read, the globe and captions, the toast, code search, time tags, History, the contact copy in the guard trigger and the hidden payment fields on the edit sheet, and the stale and wrong state refresh on every step. Satisfies **AC-3**, **AC-4**, **AC-5**, **AC-11**, **AC-14**, **AC-16**
5. **Retention, privacy and signals.** Restate `payment_proofs_due()` and `purge_online_booking_details()`, the `/privacy` sentence, the four events on the allow list. Satisfies **AC-18**, **AC-19**
6. **Finish.** Focus and keyboard passes, 360 pixel pass, contrast; database tests for every function, policy, trigger and check (`npm run test:db`), including each refusal in AC-15; unit tests for the schemas, the code normaliser, the message builder, the refund defaults and the time tags; a real browser run of the critical scenarios with an admin and a plain staff account; `npm run check` green. Satisfies **AC-20**, and proves again **AC-7**, **AC-8**, **AC-14**, **AC-15**

## Consequences

**Positive**

- The loop spec 0015 opened closes: every online payment is checked by a named manager, and the player's "Confirmed" becomes a promise someone stood behind.
- No refund is lost. Paid after hold players and turned down payers sit in one list until someone records the money going back.
- The booking and its rows can no longer drift: spec 0015's "header drift" consequence is resolved in Postgres, not by convention.
- Ella can answer "who turned this down and why" from History, months later.

**Negative / tradeoffs**

- **Checks wait for a manager.** Plain staff can see a booking is unchecked but cannot clear it; on a shift with no owner or admin, the queue grows and a player may arrive unchecked. The "Started, not checked" tag makes that visible, nothing more.
- **More people see bank screenshots.** Every active staff member can open them (the engineer's choice). That widens who sees personal financial data under the Data Privacy Act; the 5 minute URLs and the purge limit it, they do not prevent it.
- **The message is not proven sent.** The app prepares the text but cannot know staff sent it; the booking rule's "we'll message you first" rests on the manager.
- **A trigger with real logic.** `guard_online_reservation()` refuses and copies, so a confusing database error during an edit or cancel will trace to it. Its refusals carry a clear message, and its tests must cover every path.
- **Ended rows stay active after a turn down.** A slot already played before a payment is turned down still counts as used in the usage report. That is accurate for court usage but reads oddly beside a rejected booking.
- **Refund amounts are trusted.** The app records what staff type; it cannot see the venue's GCash.

**Neutral**

- `decided_at` now moves when a confirmed booking is later turned down, so a proof's 30 days restart from the latest decision.
- `BOOKING_STATUS_LABEL` keeps its wording; the sheet adds the refund line beside it.
- The usage report's day list shows a turned down or cancelled online row like any staff cancel (its `cancelled_by` is set), which is what spec 0015, AC-16 intended.
- New named rule for `/sync`: an online booking's rows change state only through the decision functions.

## Follow-up

- [ ] Ella approves `PLAYER_MESSAGES` (the wording under Decision) before the feature goes live.
- [ ] Feature 18 (lookup): spec 0015 shows the player "Confirmed" from submit, while feature 18's scope row lists "waiting for check" as a status. `/architect booking receipt & lookup` decides what a player sees for `pending_check`, `rejected`, `cancelled` and a refund owed; this spec only guarantees the columns.
- [ ] Spec 0015: AC-23's proof rule now keeps a proof while a refund is owed (AC-18 here), and its "header drift" consequence is resolved. `/architect` amends spec 0015 to point here.
- [ ] Spec 0002: `booking_event`, the refund columns, and the reservation guard trigger.
- [ ] `/sync`: record `lib/online-checks/` (a nested `AGENTS.md`), the guard trigger rule in `supabase/AGENTS.md`, and the `booking_changed` event beside the other broadcast events.
- [x] Later, if checks pile up on shifts without a manager: let plain staff confirm (never turn down), one change inside `confirm_online_booking`. Enrolled in the scope's Deferred list on 2026-10-03.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
