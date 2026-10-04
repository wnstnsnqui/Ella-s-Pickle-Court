# 0017. Booking receipt and lookup: a public page that finds a booking by its code, and a receipt that saves as a PDF

**Date**: 2026-10-03 · amended 2026-10-04 (the payment method reads GCash transfer: AC-3)
**Status**: In Progress

## Summary

A player can now type their booking code on a new page, `/booking`, and see where their booking stands: Confirmed, Cancelled (with a plain reason), or Not booked, plus any refund on its way. The page shows the receipt with the booker's contact details masked, because codes get shared in group chats. The server reads the booking through a new narrow database role that can run exactly one function, and Postgres counts wrong codes per connection (5 per 15 minutes) so nobody can guess their way in. Both this page and the checkout receipt gain "Save as PDF" (the browser's print dialog, styled to print cleanly) beside the existing "Save as image".

## Requirements

**User stories**

- As a player, I want to type my code and see whether my booking still stands, so that I know before I drive over.
- As a player whose booking was called off, I want to see why and whether my money is coming back, so that I don't have to message to find out.
- As a player, I want my receipt as a PDF I can print or keep, so that I can show it at the desk or claim the expense.
- As a booker who shares the code with friends, I want the page to hide my phone and email, so that sharing the code doesn't share my contact details.
- As Ella, I want codes impossible to guess and the page kept out of search engines, so that nobody browses other people's bookings.
- As Ella, I want fewer "is my booking OK?" and "where's my refund?" messages, so that the desk has time for players in front of it.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable)

- **AC-1**: **The page.** `/booking` renders the landing top bar and footer around one centered column (the checkout card's width, `max-width: 28rem`, a 16 pixel gutter at 360 pixels). It opens with the heading "Find your booking", the line "Type the code from your receipt to see where your booking stands.", one field labelled "Booking code" (placeholder `K7MQ-3XPT`, `autoComplete="off"`, `autoCapitalize="characters"`, `spellCheck={false}`, `enterKeyHint="search"`) and a "Find booking" button. The result appears below the form, which stays in place so another code can be tried. The page's metadata sets `robots: { index: false, follow: false }` and the title "Find your booking"; `/booking` is not in `PUBLIC_PATHS` (the sitemap) and not disallowed in `robots.txt`, so crawlers can read the noindex.
- **AC-2**: **The code as typed.** The action uppercases the input and strips spaces and dashes, then requires exactly 8 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (spec 0015, AC-18). Anything else answers `invalid` with "A booking code is 8 letters and numbers, like K7MQ-3XPT." tied to the field (`aria-invalid`, `aria-describedby`), without calling the database and without counting as a miss (it cannot match any booking).
- **AC-3**: **Found and standing.** A code whose booking is `pending_check` or `confirmed` shows, status first: a large status badge with a check icon reading "Confirmed" and the line "Staff check every payment. If yours doesn't match, we'll message you." (the same words for both states; the lookup never tells the player whether the check has happened, matching the checkout receipt, spec 0015 AC-14). Then "Your booking code" with the code grouped `XXXX-XXXX` and a Copy button; the **Selected courts and slots** card (one row per run: court name, the day from `formatDayHeading`, the time range, the hours chip; then the fee line and "Total"); **Customer** (AC-4); **Payment** ("GCash transfer", "Sent" with the submitted time in `Asia/Manila`); "Total paid" with the amount; then the actions (AC-12, AC-14, AC-15) and **Need a change?** with Messenger and Text us, the Text us body prefilled with the code. Focus moves to the status heading when a result appears.
- **AC-4**: **Contact, masked.** The Customer card shows the first name only (the first whitespace separated word of the trimmed `customer_name`, the `playerFirstName()` rule from spec 0016), the phone as `•••• 4567` (its last 4 digits), and the email as its first character, `•••`, then `@` and the domain (`j•••@gmail.com`). The masking happens inside the database function; the full name, phone and email never leave Postgres on this path. A null phone or email drops its line (defensive only: the 30 day ended window, AC-9, always closes before spec 0015's 90 day contact purge, so no reachable view meets a purged field today).
- **AC-5**: **Called off.** A `rejected` or `cancelled` booking shows the badge "Cancelled" (an X icon) and one plain reason line from the latest `booking_event` of kind `rejected` or `cancelled`, mapped through `LOOKUP_REASON_LINES` (no_payment "We couldn't find your payment."; amount_mismatch "The amount we received didn't match the amount due."; reference_mismatch "We couldn't match your payment's reference number."; invalid_proof "The screenshot didn't show a completed payment."; player_asked "You asked us to cancel."; payment_reversed "Your payment was reversed."; venue_issue "We had to close the court."; other "Message us if you have any questions."), never the staff note. The rest of the receipt shows as in AC-3, with "Total" in place of "Total paid".
- **AC-6**: **Refunds.** When `refund_status = 'owed'`, a line under the badge reads "Refund on its way: ₱1,000" (the booking's `amount`). When `refunded`, "Refunded ₱1,000 on Sat 31 Oct" (`refund_amount`; the date is `formatDayHeading(calendarDateInZone(refunded_at, "Asia/Manila"))`). `not_owed` or null shows no refund line.
- **AC-7**: **Paid, but not booked.** An `expired` booking with a `submitted_at` (paid after the hold, slots lost, spec 0015 AC-13) shows the badge "Not booked" and the line "Your payment arrived after your slots were taken.", the refund line (AC-6), the runs it tried for, and Need a change? with Messenger and Text us. "Total" in place of "Total paid".
- **AC-8**: **Not found.** An unknown code, and a code whose booking has no `submitted_at` (an abandoned hold, whose code the player never saw), both answer exactly "We couldn't find a booking with that code. Check it against your receipt, or message us." with Messenger and Text us. The two are indistinguishable in the answer, its timing class, and the analytics. Each counts as one miss (AC-10).
- **AC-9**: **Ended.** A booking whose last slot ended more than `LOOKUP_DAYS_AFTER_LAST_SLOT` (30) days ago answers "This booking ended on Sat 31 Oct. Message us if you need its receipt." with no other detail, whatever its status. The last slot is `max(ends_at)` over the rows that stand for the booking: its `active` rows when `pending_check` or `confirmed`, otherwise the rows sharing its latest `created_at` (spec 0016's rule). The date shown is that last run's day, taken from its start, never its end (a run ending at `24:00` has an `ends_at` on the next calendar day): `formatDayHeading(calendarDateInZone(lastRun.startsAt, "Asia/Manila"))`. An ended answer is not a miss.
- **AC-10**: **The limit.** `lookup_online_booking` first takes a transaction advisory lock on the caller's client hash, then counts that hash's rows in `booking_lookup_miss` from the last 15 minutes; at 5 or more it answers `rate_limited` with the seconds until the oldest ages out, whatever the code (a correct code is refused too while limited). Otherwise a not found answer inserts one miss row. The page shows "Too many wrong codes from this connection. Try again in N minutes, or message us." (N is `Math.max(1, Math.ceil(retryAfterSeconds / 60))`, the rounding checkout already uses; "1 minute" when N is 1) with Messenger and Text us. Found and ended answers write nothing. A request with no client address hashes the string `unknown` (spec 0015, AC-19).
- **AC-11**: **The code stays out of URLs.** The form posts through a Server Action, so the code never sits in a path or query string, server logs, or a referrer. The receipt's "Track this booking" link opens `/booking#K7MQ3XPT` in a new tab; the page reads the fragment once on load, runs the lookup, and clears it with `history.replaceState`. The code is held only in the page's memory (no `localStorage`), and no analytics event or log line carries it.
- **AC-12**: **Fresh status.** After a found result, the page reads the same code again when the tab becomes visible (`visibilitychange`) and on a "Check again" button, swapping the result in place without moving focus, and announcing a changed status through a polite live region ("Status changed: Cancelled"). A repeat read of a found code never counts as a miss.
- **AC-13**: **A failed read.** A database error, timeout, or unexpected answer shows "We couldn't check your booking just now." with Try again, and Messenger and Text us (the Text us body prefilled with the code). It never counts as a miss, and goes through `reportFailure()` scrubbed.
- **AC-14**: **Save as PDF.** A "Save as PDF" button on the found result (AC-3, AC-5, AC-7) and on the checkout receipt calls `window.print()`. A print stylesheet prints only the receipt: the venue name, address and phone at the top; the status, code, runs, Customer, Payment and total in black on white with borders in place of fills; no top bar, form, buttons, footer, overlay or dialog chrome; no inner scroll or clipping (in print the dialog's portal, overlay and content are forced to `position: static`, `overflow: visible` and no height limit, and the body's scroll lock is released, so the receipt flows from the top of the first page rather than printing blank or clipped); on one A4 or Letter page for a booking of up to 6 runs. The checkout receipt prints its full contact details; the lookup prints the masked ones.
- **AC-15**: **Save as image on the lookup.** The found result carries "Save as image" (spec 0015's share sheet or download), drawing the same view the page shows: the status badge's word and the title for that status ("Booking confirmed", "Booking cancelled", "Not booked"), the masked contact, the reason and refund lines when present, and no reference digits. The checkout receipt's image is unchanged in content.
- **AC-16**: **The checkout receipt grows.** Beside "Save as image", the checkout receipt (spec 0015, AC-14) gains "Save as PDF" (AC-14) and a "Track this booking" link (AC-11). Its own contact lines stay in full.
- **AC-17**: **Ways in.** While checkout is on (`checkoutEnabled()`), the landing top bar and footer carry a "Find my booking" link to `/booking`. The top bar's and footer's section links become `/#offers`, `/#book`, `/#visit` so they work from `/booking`. Spec 0016's `PLAYER_MESSAGES` gain a closing line "See your booking any time at <site>/booking", with `<site>` from `NEXT_PUBLIC_SITE_URL`. `/booking` itself always works, whatever the switch.
- **AC-18**: **Nothing extra leaves the database.** `anon` and `authenticated` gain no grant. A new `nologin` role `booking_lookup`, granted to `authenticator`, holds `execute` on `lookup_online_booking` and nothing else; the server reaches it with a 60 second token from `mintBookingLookupToken(clientHash)` in `lib/supabase/staff-token.ts`, called only from `lib/booking/actions.ts`. The function's answer carries only: the view kind, the code, the masked contact, the reason code, the refund status, amount and date, the amount, `submitted_at`, and each run's court name, start, end and amount. It never carries a booking id, full name, phone or email, reference digits, proof path, client hash, staff name or note. A database test shows the anon key and a staff token refused on the function and on `booking_lookup_miss`.
- **AC-19**: **Retention and privacy.** The nightly `purge_online_booking_details()` also deletes `booking_lookup_miss` rows older than `CLIENT_HASH_RETENTION_DAYS` (1). `/privacy` gains one line: a wrong booking code records a one way hash of your connection for one day, to stop guessing. No `PRIVACY_NOTICE_VERSION` bump (staff handle nothing new).
- **AC-20**: **Analytics.** After the function answers, and never awaited, the action sends one cookieless event through `capturePublicEvent()`: `booking_lookup` `{ result: "found" | "not_found" | "ended" | "rate_limited", view?: "confirmed" | "cancelled" | "not_booked" }` (`view` only when found), added to the allow list in `lib/analytics/properties.ts` with a `.strict()` schema. No code, no hash. `invalid` is logged with `console.warn` only; `failed` goes through `reportFailure()`.
- **AC-21**: **Look, motion and access.** Built to `docs/design.md` with the landing page's look and motion (the `apple-design`, `emil-design-eng` and `animate` skills): the result fades and rises 8 pixels in over `--dur-step` with `--curve-out`, and only fades with reduced motion; pressable controls scale to 0.97. Every control works from the keyboard and is at least 44 pixels tall; the page works at 360 pixels wide with no sideways scroll; status is carried by the word and the icon, never colour alone.

## Decision

**Chosen option**: Option 2: A server gated read through a new `booking_lookup` Postgres role, with the masking and the miss limit inside one database function, and Save as PDF through the browser's print dialog.

The browser posts the code to a public Server Action; the action hashes the connection, mints a 60 second token for a role that can run one function, and Postgres does the rest: the limit, the lookup, the status mapping's raw facts and the masking.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `zod` (`pproenca/dot-skills`, `.agents/skills/zod/`) · `tailwind-4-docs` (`lombiq/tailwind-agent-skills`, `.agents/skills/tailwind-4-docs/`, the `print:` variant) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`) · `apple-design`, `emil-design-eng`, `animate` (the slice 7 look and motion) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `playwright-cli` (`microsoft/playwright-cli`, `.agents/skills/playwright-cli/`)

Settled while writing (each with its runner up):

- **The action lives in `lib/booking/actions.ts`** as `lookupBooking`, beside the hold, submit and release, so the named exception to "`requireStaff()` first" stays one file. Its gate is the Postgres miss limit, then Zod. Runner up: a new `lib/booking/lookup-actions.ts`, which would be a third named exception file for no gain.
- **A third fixed minter**, `mintBookingLookupToken(clientHash)`, in `lib/supabase/staff-token.ts`: `role: "booking_lookup"`, a `client_hash` claim, no `sub`, 60 seconds. `SUPABASE_JWT_SECRET` keeps one reader. Runner up: reuse `mintOnlineBookingToken` with the shared role, which the engineer declined.
- **Masking in SQL, not in the action.** The function returns the masked strings, so the unmasked contact never crosses into Node on this path. Runner up: mask in the action, which keeps the SQL shorter but puts full contact details in server memory and any log of the raw answer.
- **The function answers `jsonb`** (`{ ok: true, view, ... }` or `{ ok: false, reason, retry_after_seconds? }`) like spec 0015's functions, parsed through a schema in `lib/booking/schemas.ts`. The words (badge, reason lines, refund line) are mapped in TypeScript from the codes, so copy changes need no migration. Runner up: return the words from SQL, which splits copy across two languages.
- **The advisory lock** (`pg_advisory_xact_lock(hashtextextended('booking_lookup:' || client_hash, 0))`, namespaced the way the hold's `'online_booking:'` key is, so the two limits never share a lock) makes the count and the insert one step per connection, so parallel guesses cannot slip past 5. Runner up: no lock, which lets a burst of parallel requests each see 4 misses.
- **One receipt view model for every surface.** A pure `buildReceiptView()` in `components/receipt/receipt-view.ts` turns either the checkout's `BookingReceipt` (full contact) or the lookup's answer (masked contact) into one `ReceiptView` (status word, title, lines, code, runs with court names and the day heading, customer facts, payment facts, total label and amount). The screen, the print layout and `receiptImageModel()` all read it, so the three never drift. The receipt pieces move from `components/landing/` into a new `components/receipt/` (`receipt-card.tsx`, `receipt-image.ts`, `receipt-view.ts`), imported by both the checkout and `/booking`. Runner up: copy the checkout receipt into the page, two layouts to keep in step.
- **The day heading comes from the runs** on the lookup: `formatDayHeading` of the first run's `starts_at` in `Asia/Manila`. A booking covers one day (spec 0015, AC-1), so one heading serves every run.
- **"Track this booking" opens a new tab**, so the checkout receipt stays on screen to save. Runner up: same tab, which unmounts the card mid save.
- **The ended window lives in SQL** with the number mirrored as `LOOKUP_DAYS_AFTER_LAST_SLOT` in `lib/booking/constants.ts`, pinned equal by a test as the retention numbers are. Runner up: a function argument, which a caller could change.
- **The "Find my booking" links follow the checkout switch**, because with checkout off nobody holds a code. Runner up: always shown, which points players at a page they cannot use today.
- **`/booking` renders per request**, because its top bar reads `checkoutEnabled()`. The lookup itself is never cached.
- **No `PRIVACY_NOTICE_VERSION` bump.** The new line tells players about a one day hash; staff handle nothing new, and the version exists for staff acknowledgement. Runner up: bump it, which asks every staff member to acknowledge a change that does not concern them.

## Feature design

**Data model sketch**

`booking_lookup_miss` (new; no `anon` or `authenticated` grant; written only by `lookup_online_booking`):

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | bigint identity | no | PK |
| `client_hash` | text | no | the minted token's `client_hash` claim |
| `created_at` | timestamptz | no | default `now()` |

Index: `(client_hash, created_at)`. No foreign key and no column that names a booking, on purpose. Rows older than 1 day are deleted nightly.

Role: `booking_lookup` (`nologin`), granted to `authenticator`. `execute` on `public.lookup_online_booking(text)` only.

Read only on this path: `booking` (`code`, `status`, `submitted_at`, `customer_name`, `customer_phone`, `customer_email`, `amount`, `refund_status`, `refund_amount`, `refunded_at`), `reservation` (`booking_id`, `court_id`, `starts_at`, `ends_at`, `amount`, `status`, `created_at`), `court` (`name`), `booking_event` (`kind`, `reason`, `created_at`). No change to any of them.

**State transitions**

None new. The lookup maps existing states to what the player reads:

| `booking.status` | `submitted_at` | Last slot ended over 30 days ago | Player reads |
| --- | --- | --- | --- |
| `held`, `expired` | null | any | Not found (AC-8) |
| any | set | yes | Ended (AC-9) |
| `pending_check`, `confirmed` | set | no | Confirmed (AC-3) |
| `rejected`, `cancelled` | set | no | Cancelled, with the reason (AC-5) |
| `expired` | set | no | Not booked (AC-7) |

The refund line (AC-6) applies on top of Confirmed, Cancelled and Not booked.

**API surface**

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
| --- | --- | --- | --- | --- | --- |
| `lookupBooking` (`lib/booking/actions.ts`) | Server Action | `code: string` (any form; normalised, AC-2) | `{ ok: true, data: BookingLookup }` with `view: "confirmed" \| "cancelled" \| "not_booked"`, `code`, `reason`, `refund`, `customer { firstName, phoneLast4, emailMasked }`, `amount`, `submittedAt`, `runs[] { courtId, courtName, startsAt, endsAt, amount }`; or `{ ok: false, error }` | public; Postgres miss limit, then the minted `booking_lookup` token | `invalid`, `not_found`, `ended { endedAt }`, `rate_limited { retryAfterSeconds }`, `failed` |
| `public.lookup_online_booking(p_code text)` | RPC, `security definer`, `search_path = ''` | the normalised code; `client_hash` from `auth.jwt()` | `jsonb`: `{ ok: true, view, code, reason, refund_status, refund_amount, refunded_at, first_name, phone_last4, email_masked, amount, submitted_at, runs }` or `{ ok: false, reason: "not_found" \| "ended" \| "rate_limited", ended_at?, retry_after_seconds? }` | `booking_lookup` only | raises only on bugs |
| `public.purge_online_booking_details()` (existing, widened) | `pg_cron`, nightly | | also deletes misses over 1 day old | no grant | |
| `mintBookingLookupToken(clientHash)` (`lib/supabase/staff-token.ts`) | server function | `clientHash` | a 60 second JWT, `role: "booking_lookup"` | imported only by `lib/booking/actions.ts` (pinned in `lib/import-boundaries.test.ts`) | |

**Value sourcing**

| Action | Value produced / displayed | Source |
| --- | --- | --- |
| Lookup | the normalised code | the input, uppercased, spaces and dashes stripped, checked against the AC-18 alphabet of spec 0015 (`lib/booking/schemas.ts`) |
| Lookup | client hash | `hashClient()` in `lib/booking/client-hash.ts` over `clientAddress()` (or `unknown`), carried in the token's claim |
| Lookup | miss count, retry seconds | `booking_lookup_miss` rows for the hash with `created_at > now() - interval '15 minutes'`; seconds from the oldest row's `created_at + 15 minutes - now()` |
| Lookup | the view kind | `booking.status` and `submitted_at` by the table above |
| Lookup | ended, and the ended date | `max(reservation.ends_at)` over the rows that stand for the booking (AC-9), compared with `now() - interval '30 days'`; the date shown is the last run's day from its start, `formatDayHeading(calendarDateInZone(startsAt, "Asia/Manila"))` (`lib/time.ts`) |
| Badge, title | "Confirmed", "Cancelled", "Not booked", and "Booking confirmed", "Booking cancelled", "Not booked" | fixed copy keyed by `view`, in `components/receipt/receipt-view.ts` |
| Reason line | the plain reason | latest `booking_event` (by `created_at`) of kind `rejected` or `cancelled` for the booking, its `reason` code mapped through `LOOKUP_REASON_LINES` (pure, `lib/booking/lookup.ts`, pending Ella's approval) |
| Refund line | owed amount; refunded amount and date | owed: `booking.amount`; refunded: `booking.refund_amount`, and the date `formatDayHeading(calendarDateInZone(refunded_at, "Asia/Manila"))` |
| Limit refusal | minutes to wait | `Math.max(1, Math.ceil(retryAfterSeconds / 60))` from the function's `retry_after_seconds` |
| Customer | first name, phone, email | masked in SQL: the first word of `btrim(customer_name)` split on whitespace; `'•••• ' \|\| right(customer_phone, 4)`; `left(local part, 1) \|\| '•••@' \|\| domain` of `customer_email`; null when the column is null |
| Runs | court name, day, time range, hours chip, amount | `court.name` by `reservation.court_id`; `formatDayHeading` of the first run's start; the grid's slot labels with `24:00` as an end (`localEndTimeInZone()`); `hoursChip()`; `reservation.amount` |
| Payment | method, sent time | `PAYMENT_METHOD_LABEL` ("GCash transfer") in `lib/booking/constants.ts`; `booking.submitted_at` in `Asia/Manila` |
| Total | label and amount | "Total paid" when `view` is `confirmed`, else "Total"; `booking.amount` through `formatPeso()` |
| Need a change? | Messenger link, Text us body | `VENUE_MESSENGER_URL`; `smsBody()` with the code (the existing helper, extended to take a code) |
| Track this booking | the link | `/booking#` plus the stored code (no dash), from the submit result |
| Staff texts | the site address | `NEXT_PUBLIC_SITE_URL` (already read by the layout, sitemap and robots), joined with `/booking` |
| Print | venue name, address, phone | `VENUE_NAME`, `VENUE_ADDRESS`, `VENUE_PHONE_DISPLAY` in `lib/venue.ts` |
| Page | whether the "Find my booking" links show | `checkoutEnabled()` on the server, per request |
| Analytics | `result`, `view` | the function's answer |

**Key invariants**

1. A lookup never writes anything but one miss row, and only on a not found answer.
2. No more than 5 misses count per client hash in any 15 minutes, and while limited every code is refused, so the limit does not leak whether a code exists.
3. A code the player never saw (no `submitted_at`) behaves exactly like an unknown code.
4. Full contact details, reference digits, proof paths, client hashes, staff names, notes and booking ids never appear in the lookup's answer, page, image, print or analytics.
5. The code never appears in a URL the server receives, a log line, or an analytics event.
6. The ended window in SQL and `LOOKUP_DAYS_AFTER_LAST_SLOT` are the same number.
7. The checkout receipt, the lookup, the print layout and the saved image all render from one `ReceiptView`.

**Security model**

- **Anyone** may post a code to `lookupBooking`. Holding a valid code is the whole capability; what it shows is limited to what a shared code should reveal (AC-4, AC-18).
- **Guessing** is held off by the code space (31 to the 8th, about 850 billion) and the miss limit: 5 misses per 15 minutes per connection gives a guesser about 480 tries a day, a vanishing chance against a few thousand live codes. A guesser who rotates addresses is the residual risk (Consequences).
- **The server** mints the `booking_lookup` token only inside `lib/booking/actions.ts`, for 60 seconds; the token can run one read function, so a leaked one is worth a minute of lookups under its own hash.
- **Staff** gain nothing and lose nothing; they keep using spec 0016's views.
- **Compliance scope**: the Philippine Data Privacy Act of 2012. The lookup shows personal data only masked; the one new record (a connection hash on a miss) is disclosed on `/privacy` and deleted after a day by the database.
- **Search engines**: `noindex, nofollow`, not in the sitemap; the result is never part of the HTML a crawler receives, since it arrives through a Server Action.

**Configuration required**

No new environment values. The lookup reuses `BOOKING_CLIENT_HASH_SECRET` (the client hash), `SUPABASE_JWT_SECRET` (through `staff-token.ts` only) and `NEXT_PUBLIC_SITE_URL` (the staff text link).

**Critical test scenarios**

- Happy path: submit a real booking through checkout, press Track this booking; `/booking` opens with the fragment cleared, reads Confirmed with masked contact; staff confirm, then the tab regains focus and still reads Confirmed; Save as PDF prints one clean page, verifies **AC-1**, **AC-3**, **AC-4**, **AC-11**, **AC-12**, **AC-14**, **AC-16**
- Every state: a turned down booking with a refund owed reads Cancelled, the reason and "Refund on its way"; after Mark refunded it reads "Refunded … on …"; a paid after hold booking reads Not booked; an abandoned hold's code reads not found; a booking 31 days past its last slot reads ended, verifies **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-9**
- Limit: five wrong codes from one connection, then the sixth and a correct code are both refused with a wait; malformed codes never count; parallel wrong codes cannot exceed five, verifies **AC-2**, **AC-10**
- Auth and permission: the anon key and a staff token calling `lookup_online_booking` or selecting `booking_lookup_miss` are refused; a `booking_lookup` token cannot select `booking`, `reservation` beyond the anon grant, or call the hold; the answer's keys match the allowed list exactly, verifies **AC-18**
- Failure: with the database unreachable, the page shows the retry card and nothing counts as a miss, verifies **AC-13**
- Image and print: the lookup's saved image and print show the masked contact and the status title; the checkout's show the full contact, verifies **AC-14**, **AC-15**
- Ways in and privacy: the links show only with checkout on; the section links work from `/booking`; `/booking` carries noindex and is absent from the sitemap; old misses are purged, verifies **AC-1**, **AC-17**, **AC-19**
- Analytics: each answer sends one `booking_lookup` event with no code, verifies **AC-20**

## Build plan

Tracer Bullet: the first task proves one real lookup end to end (browser, action, minted role, Postgres, page) including the one new platform piece (a second custom role through PostgREST), before any state, limit or download is thickened.

1. **The thin thread.** Migration: the `booking_lookup` role and its grant to `authenticator`, `booking_lookup_miss`, and `lookup_online_booking` answering found (Confirmed only, masked contact, runs with court names) and not found (writing a miss), grants, `db advisors` clean, types regenerated. `mintBookingLookupToken()` with its boundary pinned in `lib/import-boundaries.test.ts`; `lookupBooking` with the code schema; `app/booking/page.tsx` with the field and a bare result (badge, code, runs). Proven live against a real submitted booking on the linked project, and the anon key refused on the function. Satisfies **AC-1**, **AC-2**, **AC-3** (bare), **AC-8**, **AC-18**
2. **One receipt for every surface.** `components/receipt/` with `buildReceiptView()`, the receipt card and `receipt-image.ts` moved from `components/landing/`; the checkout receipt switched onto it with no visible change (its tests stay green); the lookup's full Confirmed view, then Cancelled with `LOOKUP_REASON_LINES`, the refund line, Not booked and Ended in the function and the page. Satisfies **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-9**
3. **The limit and the edges.** The 15 minute miss count with the advisory lock, the limited refusal and its copy, the failure card, Check again and the read on return with its live region. Satisfies **AC-10**, **AC-12**, **AC-13**
4. **Downloads and ways in.** The print stylesheet and Save as PDF on both receipts (the dialog's height lifted in print), Save as image on the lookup from the view, Track this booking with the fragment handoff, the "Find my booking" links and the `/#` section links, the staff text line. Satisfies **AC-11**, **AC-14**, **AC-15**, **AC-16**, **AC-17**
5. **Privacy and signals.** The miss purge in `purge_online_booking_details()`, the `/privacy` line, `LOOKUP_DAYS_AFTER_LAST_SLOT` with its pin test, the `booking_lookup` event on the allow list, scrubbed failure reports. Satisfies **AC-19**, **AC-20**
6. **Finish.** The result's motion and reduced motion, focus to the status heading, keyboard and 360 pixel passes, contrast; database tests for the function's every answer, the limit, the lock under parallel calls, the grants and the answer's exact keys (`npm run test:db`); unit tests for the code schema, `buildReceiptView()` across the views, the reason and refund lines; a real browser run of the critical scenarios including a printed PDF on desktop and a phone; `npm run check` green. Satisfies **AC-21**, and re proves **AC-10**, **AC-14**, **AC-18**

## Consequences

**Positive**

- Players answer "is my booking OK?" and "where's my refund?" themselves, which is the deferred email confirmation's job done without a sending service.
- A shared code is safe to share: friends see the booking, not the booker's contact.
- One receipt model means the screen, the PDF and the image cannot disagree.

**Negative / tradeoffs**

- **The scope's wording changes.** Feature 18's done when lists "waiting for check" as a status. The engineer chose "Confirmed" for both checked and unchecked bookings, to keep the checkout receipt's promise, so the lookup never shows a waiting state. A player whose payment fails the check reads Confirmed until a manager acts.
- **A third token shape and a second custom role.** `staff-token.ts` now mints three fixed shapes; each is pinned to its one caller.
- **Rotating addresses beat the limit.** The miss limit is per connection; a guesser with many addresses gets 5 tries each per 15 minutes. The code space keeps that hopeless in practice, but it is the residual risk, and Turnstile on the lookup is the fix if misses ever spike (the `booking_lookup` event's `not_found` count shows it).
- **A shared connection can lock out a real player** after five typos from the same café or carrier address, for up to 15 minutes. The refusal offers Messenger and Text us.
- **Ended after 30 days.** A player wanting a receipt months later must message the venue; staff still see the booking.
- **Print to PDF varies by browser.** "Save as PDF" opens the print dialog, not a file download; on iPhone the player picks Save to Files from the share sheet. That is one more tap than a generated file, accepted to avoid a PDF library and a second layout.
- **The analytics rule bends.** The project rule says events follow a successful write; a lookup is a read that sends an event on every answer. `/sync` records this beside the checkout's exceptions.

**Neutral**

- The receipt pieces move from `components/landing/` to `components/receipt/`; `components/landing/AGENTS.md` and the checkout's imports follow.
- The landing top bar and footer section links change from `#offers` to `/#offers`; on `/` they behave the same.
- Spec 0016's player messages gain one closing line, still pending Ella's approval with the rest.

## Follow-up

- [ ] Ella approves `LOOKUP_REASON_LINES` (AC-5) together with spec 0016's `PLAYER_MESSAGES`, and the new closing line (AC-17).
- [ ] `/scope`: feature 18's done when reads "waiting for check, confirmed, turned down, cancelled"; it becomes "Confirmed, Cancelled with a reason, Not booked, and any refund" to match this spec.
- [ ] `/sync`: record `lookupBooking` inside the named `lib/booking/actions.ts` exception (its gate is the miss limit), the third minter, the `booking_lookup` role, `components/receipt/`, and the read event exception to the analytics rule, in root `AGENTS.md`, `lib/booking/AGENTS.md` and `components/landing/AGENTS.md`.
- [ ] Spec 0015: AC-14 gains Save as PDF and Track this booking (this spec, AC-16), and its Follow-up line for feature 18 closes. Spec 0016: AC-9's messages gain the closing line. Spec 0010: the new one day miss hash on `/privacy`. `/architect` amends each.
- [ ] Watch the `booking_lookup` event's `not_found` and `rate_limited` counts for a month after checkout goes live; a spike is the signal to add Turnstile after the limit trips (runner up in rationale.md).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
