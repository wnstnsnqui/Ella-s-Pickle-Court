# 0005. Staff booking schedule: rationale

The decision record for [index.md](index.md). `/develop` reads the index; this file holds the why.

## Context

> ⚠️ Premise note: you chose a selection that may hold any cells on any court, not only a contiguous run. That is the right shape for a class that takes two courts at once, and it is also the shape that quietly produces two bookings when somebody taps 4pm and 6pm and forgets 5pm. The spec keeps your choice and makes the cost visible: the bar says how many bookings a selection will make, the whole set is written in one statement, and the rows of one selection are not linked in the database. If that last part bites (cancelling a class is two cancels), a `booking_group` column is a small follow up under spec 0002, not a redesign.

Feature 6 is the screen the product exists for. Spec 0002 built the ground under it: one `reservation` table of time ranges, an exclusion constraint (a database rule that refuses two active rows overlapping on a court), Server Actions for creating, updating and cancelling a reservation, and the grid derivation that turns a day into labelled cells. Spec 0003 built the grid, the seven cell views including three (Selected, Saving, Failed) that exist only for this screen, and the sheet, dialog and toast components. Spec 0004 built sign in and the `staff` row with its role. What did not exist was the page itself, the way a tap becomes a write, and the staff side of the live connection, which spec 0004 explicitly left to this feature along with the question of where the staff grid lives.

The forces are the desk's. Staff work on a phone or a tablet, often while a customer waits, so the common case (one hour, one court, one name) has to be a few taps, and the uncommon case (a class across two courts, a closure for a repair) must not need a different mental model. Two staff members can act on the same hour within the same second, and a player is watching the public board at the same time, so the screen has to tell the truth quickly after any write, its own or somebody else's. The venue's wifi is not guaranteed, so a slow or dropped call has to end somewhere sane. And the past is Ella's: spec 0002 already makes an ended row owner only, so the screen has to reflect that rather than let staff discover it as a refusal.

Not deciding this means features 3 and 5 stay half proven. Both have one last task that needs a real booking made through a real screen by a signed in person, watched in a second browser. Until this exists the whole Tracer Bullet is a thread with no needle.

## Options considered

### Option 1: Tap to book, one cell at a time

Tapping an Available cell opens the booking form at once, prefilled with that court and hour; an end time select in the form stretches the booking along the free run. Booked cells open a details sheet. No selection state, no bar.

**Pros**

- Fewest concepts. A tap is a form. Nothing to clear, nothing to explain.
- The existing `createReservation` action is used as is; no batch write, no runs derivation.
- Easiest to get right on a phone: one sheet, one submit.

**Cons**

- A class across two courts is two full forms with the same name typed twice, and the two bookings cannot fail together.
- The end time select is the only way to book more than a slot, so the grid's cells stop being the thing you point at once you are in the form.
- The Selected view spec 0003 built has no consumer.

### Option 2: A selection bar over the grid, sheets for the forms, one batch action (chosen)

Cells toggle in and out of a selection across any court. A sticky bar lists the selection as runs and offers Book, Close court and Clear. Book and Close open a sheet with the form; submitting sends the runs plus the shared fields to a new `createReservations` action that inserts every row in one statement. Booked and closure cells open a details sheet with Edit and Cancel or Reopen. A staff browser client listens with the Clerk token and refetches the day on every broadcast.

**Pros**

- One gesture for every write: point at hours, press a button, fill a short form. A class, a closure and a single hour all look the same.
- All or nothing across courts comes free from a multi row insert, because Postgres applies the exclusion constraint to the statement as a whole.
- The forms sit in sheets, so the grid stays visible on a tablet and reachable on a phone, and the details sheet doubles as the desk's "who is this" view.
- Every one of spec 0003's cell views is exercised.

**Cons**

- Selection state is a real state machine in the browser, with pruning on every refetch and an ambiguity (a gap means two bookings) the bar has to surface.
- One new Server Action and one new pure module to test.
- The rows of one selection are unrelated in the database unless a group id is added later.

### Option 3: A dedicated booking form page with pickers

A `/staff/book` page with a court select, a date, start and end time pickers and the customer fields, reached from a New booking button; the grid stays read only for staff and links out to the form. Edit and cancel are pages too.

**Pros**

- Plain forms, plain pages, trivially keyboard accessible, no client state beyond the form.
- Works even if the grid is slow to load or the realtime channel is down.

**Cons**

- It throws away the grid as the way to say "that hour". The pickers have to reinvent what the cells already show (which hours are free), and a wrong pick is refused after the fact.
- Every booking is a page navigation and back, which is the slow to update schedule the scope warns about.
- A closure or a two court class is several trips.

## Rationale

Option 2 is the one that matches how the desk actually works: you look at the grid, you point at the hours, you say who. The grid is already the best picker of free time this product has, so the form should never have to ask for a time the person just looked at. Option 1 is genuinely simpler and would have been the recommendation if bookings were always one court, but you said a class across courts is real, and the only honest way to book that is as one act that succeeds or fails together. A multi row insert gives that for free; a loop of single inserts would leave a half booked class the moment one court was taken, and that is exactly the kind of state a busy desk cannot reason about. Option 3 is the safe looking choice that makes every booking slower, which the scope names as the way a schedule stops being kept.

The decisions inside the option follow from the same forces. The board lives at `/staff` because a page that renders customer names should be a page a stranger can never receive, and `auth.protect()` in `proxy.ts` gives that before any code runs; folding it into `/` would make the one public page branch on identity, which is the kind of thing that leaks a column two features later. Edits change details only because moving a booking is cancel and rebook in the audit's eyes anyway, and because a move needs a picker that knows every court's free runs, which is a second version of the grid. Cancel asks first because `cancelled` is terminal and a phone screen is a place thumbs slip. Past slots are locked in the interface for a `staff` role because the policy will refuse the write anyway, and a refusal after typing a name is worse than a lock before it; the database stays the enforcement, so the lock can be wrong about the clock and nothing bad happens.

Two of your picks went against my recommendation and both are recorded as such. `react-hook-form` over React 19's `useActionState`: the form library is a real dependency for three forms, and the Server Action already returns per field issues, so nothing was missing. It will work well, the zod resolver keeps the rules in one place, and the installed skill's rules on `defaultValues`, `useWatch` and shadcn `Select` wiring are what to follow; the cost is one more library to know. Automatic retries over a single manual Retry: I was wary of acting twice, but on inspection every write here is guarded (the exclusion constraint for creates, `version` for updates and cancels), so a retry after a silent success comes back as a typed conflict that the following refetch resolves into "your change landed". The spec therefore honours your choice with a rule that makes it safe: retry only when no typed result arrived, and never on a typed conflict.

The live listener carries the Clerk token even though the broadcast carries nothing staff only today, because spec 0001 rule 12 asked for it and because the day a staff only payload is added should not be the day somebody discovers the staff connection was anonymous. The whole day is refetched on every broadcast because spec 0002 fixed that rule for a reason: at two courts and one day it is cheap, and it cannot drift.

**Calls made here** (the items you left to me), each with the pick, the why and the runner up:

- **Customer name on Booked cells, on every viewport.** The desk's first question is who, and a 44 pixel cell can carry one truncated line. Runner up: name only from 768 pixels up, which would have made the phone the one place the answer needs a tap.
- **Selection is a `Set` of `cellKey` strings, runs derived at the moment they are needed.** The set is the simplest thing to toggle and prune; runs are a pure derivation in `lib/schedule/selection.ts`. Runner up: storing runs directly, which makes toggling a cell in the middle of a run a splice.
- **Retry policy: 10 second timeout, three retries at 1, 2 and 4 seconds, transport failures only.** Long enough for a slow venue connection, short enough that Saving does not sit for a minute. Runner up: a single retry, which handles one blip but not a reconnect.
- **The lock clock ticks each minute on the client.** So a slot that ends at 5pm locks at 5pm without a refetch. Runner up: locking on the next refetch only, which leaves a bookable looking cell for a few minutes after it ended.
- **Sheet side by a `matchMedia` hook at 768 pixels**, the Tailwind `md` breakpoint spec 0003 already uses. Runner up: always a bottom sheet, which wastes a tablet's width.
- **Two browser clients in two files** (`browser.ts` anonymous, `staff-browser.ts` with the token). Runner up: one client that gains a token when signed in, which is exactly the merged client `lib/supabase/AGENTS.md` warns against.
- **The `?date=` parameter and the day navigation are reused unchanged**, past days included, because `DayNav` already allows them and reading yesterday answers desk questions. Runner up: clamping staff to today onward, which would have needed a prop the public board does not.
- **Fixed copy for the refused toast**, "Somebody got there first. The taken hours were cleared from your selection." Runner up: naming the court and hour, which needs the error detail parse you declined.
- **Reopen is `cancelReservation` on the closure row.** No new action; a closure has one transition like a booking. Runner up: a dedicated `reopenCourt` action that would only rename the same write.

## Interview record

The answers this spec was assembled from, in the order asked, so a later reader can see which choices were yours and which were recommendations you accepted.

| Question | Your pick | Recommended |
| --- | --- | --- |
| Where the staff board lives | own route `/staff` | same |
| Tapping an Available cell | toggle cells into a selection, then one Book button | a sheet opens at once |
| Longer than one slot | end time select listing the free run (later folded into the selection, since a cross court set has no single end) | same |
| Tapping a Booked cell | details sheet with Edit and Cancel | same |
| Range rules | any set of cells, even across courts | one contiguous run on one court |
| Closures | same selection, Close court beside Book | same |
| Cancel | confirm dialog naming the booking | same |
| Reopen a closure | yes, Reopen and Edit from the cell | same |
| A set becomes | one row per contiguous run per court, all or nothing | same |
| Past slots today | rendered, locked for staff, open for owner | same |
| Past days | navigable, read only for staff, editable for owner | same |
| Payment on the form | status select plus optional amount | same |
| Edit scope | details only | same |
| Stale edit | reload with fresh values, keep typed values visible | same |
| Refresh on broadcast | refetch the day through `getStaffSchedule` | same |
| Phone validation | loose, 7 to 30 characters, stored as typed | same |
| Data model | no schema change | same |
| Forms | react-hook-form with the zod resolver | React 19 `useActionState` |
| Who touched it | booked by and last changed by, with names | same |
| Agent skills | find them; installed `pproenca/dot-skills` `react-hook-form` | same |
| References | none | same |
| Batch write | new `createReservations`, one multi row insert | same |
| Refused cells | refetch and mark what is no longer Available | same |
| Staff names | returned by `getStaffSchedule` | same |
| Signed out on `/staff` | proxy redirect to `/sign-in` and back | same |
| Inactive on `/staff` | notice only, no grid | same |
| Owner versus staff | role drives the lock, policy enforces | same |
| Realtime token | Clerk `getToken()` re applied with `setAuth()` | same |
| Live clash with a selection | refetch, prune, toast, sheet stays | same |
| Slow write | retry automatically up to three times | Saving then Change refused with a manual Retry |
| Closed day and horizon | reuse the 0003 empty state and the nav stop | same |
| Not live | writes stay allowed | same |
| Design source | existing `design.md` and spec 0003 components | (no recommendation offered, by rule) |
| Page composition | shell, day nav and live, legend, grid, sticky bar | same |
| Sheet side | bottom under 768 pixels, right from 768 | same |
| Entry after sign in | land on `/staff`, Schedule link in the menu | same |
