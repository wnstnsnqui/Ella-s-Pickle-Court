# 0016. Rationale: staff check of online bookings

The decision record behind [index.md](index.md). `/develop` does not need this file.

## Context

Spec 0015 lets the public book and pay by QR. A booking ends `pending_check` with a screenshot and the last 4 reference digits, and the player already reads "Confirmed" on the receipt. The booking rules promise that staff check every payment afterwards, and that a booking whose payment does not match is cancelled only after the venue messages the player and refunds anything paid. Today staff only notice an online booking by opening a cell's details sheet. Nothing gathers the unchecked ones, nothing can record a decision, and the `booking` table has no staff write path at all.

The forces:

- **Money and trust.** A transfer nobody checks is not a booking anybody trusts, and a wrong check costs the venue either a free game or an angry, already paying player. The decision needs a named person and a reason that survives the shift.
- **The booking and its rows drift.** Staff can Edit or Cancel any row on the board. Spec 0015 recorded that a staff cancel leaves the booking's status behind ("header drift"), and an online booking has several rows that must move together.
- **Refunds already exist without a home.** A player who paid after the hold lapsed and lost the slot (spec 0015, AC-13) is owed money, and only a search by code finds them.
- **The desk is a phone or a tablet,** used all day on the staff board. Whatever is built has to live where staff already are, and must make an unchecked booking hard to miss as its play time comes.
- **The project's rules.** Authorization is enforced in Postgres, every state change is guarded by `version` and records `changed_by`, the board refetches on narrow broadcasts that carry nothing personal, and the app has no way to send an email or text.
- **Compliance.** The Philippine Data Privacy Act of 2012 covers the screenshot (it can show a name, number or balance), the email, the phone and any note staff write about a player.

## Options considered

### Option 1: Buttons in the details sheet only

Add Confirm and Reject to the existing Online booking block, write `status`, `decided_at` and `decided_by` with a direct update under an owner policy, and nothing else: no list, no history table, no refund tracking.

**Pros**

- The least to build: one policy, two buttons, no new table.
- Nothing new for staff to learn.

**Cons**

- Bookings days ahead go unchecked, because nobody scrolls there; nothing warns as play time comes.
- A confirm later turned down forgets who confirmed. Refunds owed stay invisible.
- A staff Cancel on one row still drifts from the booking.

### Option 2: A queue on the board, manager decisions through role checking functions, history and refunds (chosen)

A toolbar chip and list on the staff board, the full check view in the existing details sheet, four `security definer` functions that check `private.is_owner()` and write the booking, its rows and a `booking_event` in one transaction, refund tracking on `booking`, and a reservation trigger that keeps online rows in step.

**Pros**

- Staff stay on the board they use all day; the chip, the toast and the time tag make an unchecked booking hard to miss.
- Every decision has a who, a when and a why that no write path can skip. Refunds owed are tracked to the end.
- The booking and its rows cannot drift, whatever path tries to change them.

**Cons**

- The most moving parts: four functions, three triggers, a new table, a new broadcast event.
- A trigger with logic is harder to debug than a plain update.

### Option 3: A separate payments page

A new `/staff/online` page with a full table of online bookings, filters by state and date, and the decision actions, apart from the board.

**Pros**

- Room for filters, history and later reporting on payments.
- Keeps the board's toolbar unchanged.

**Cons**

- One more place to remember to look on a busy shift, which is how checks get missed.
- Duplicates the details sheet the board already has, or forces staff between two screens to see a booking and its cells.

## Rationale

The real job is "no payment goes unchecked before play, and no refund is forgotten", done by people on a phone at the desk. That rules out Option 1, which has no way to surface a booking days ahead, and argues against Option 3, which moves the work off the screen staff already watch. Option 2 puts the queue on the board through a chip and a list that reuse `BoardSheet` and the existing details sheet, so the new surface is small even though the database work is real.

The database work is where the money risk lives, so it is where the design spends its effort. Decisions go through `security definer` functions that check `private.is_owner()` first, with no write grant on `booking` or `booking_event`, because the engineer chose manager only decisions and a history that must not be skippable. An owner policy with direct updates (Option 1's shape) would let any owner token change a booking without leaving an event. The reservation guard trigger is the price of letting staff keep Edit and Cancel on the board: without it, "Cancel cancels the whole booking" holds only for the app's own buttons.

Refund tracking sits on `booking` (current state) with each step in `booking_event` (history), rather than a refunds table, because a booking has at most one refund question and the history already carries each step. Messaging stays a prefilled `sms:` link and a copy button, the engineer's pick, because it needs no provider, no domain and no cost, at the price of never knowing the text was sent.
