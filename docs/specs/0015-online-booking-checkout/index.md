# 0015. Online booking checkout with a short hold, QR payment proof, and a booking code

**Date**: 2026-09-30 · amended 2026-10-02 (the checkout card: a centered card, three consent boxes, a confirmed receipt; AC-1, AC-3, AC-8, AC-10, AC-11, AC-14, AC-15, AC-22, AC-25, new AC-27, build plan task 10; second, the code only on the receipt and Save as image, AC-8, AC-14) · amended 2026-10-04 (the method is named GCash, not QR: AC-8, AC-11, AC-14, AC-22, AC-27)
**Status**: In Progress

## Summary

A player who picks hours on `/` can now book them online: a short checkout card asks for their details, the booking rules, and a payment by the venue's QR code with a screenshot as proof, then gives them a booking code. The moment they reach the payment step, their slots are held for 5 minutes (shown Booked on both boards), so nobody can take a slot they are paying for. This is the first time the public writes to the database, so the write goes through its own narrow database role that only the server can use, after a Cloudflare Turnstile bot check (a free, mostly invisible "are you human" test). The price is worked out inside Postgres, the screenshot lives in a private bucket, and staff check the payment later (feature 17).

## Requirements

**User stories**

- As a player, I want to book the hours I picked on `/` without messaging anyone, so that I know the court is mine before I drive over.
- As a player paying by GCash, I want my slots held while I pay, so that I never pay for a slot somebody else takes.
- As a player who was slow to pay, I want my booking to still go through if the slots are still free, so that a slow bank app does not cost me my game.
- As a player, I want a code and a receipt at the end, so that I can show or quote my booking later.
- As staff, I want to see that a booking came from online and is not yet checked, so that I do not treat it as paid.
- As Ella, I want the price set in one place the server enforces, so that nobody can book at a price they made up.
- As Ella, I want bots and pranksters kept from holding every court, so that real players can still book.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable)

- **AC-1**: With checkout **on** (AC-26), the booking section's button on `/` reads "Book" and, with picks made, opens the checkout card: a centered dialog on every width (not `BoardSheet`; see AC-27 for its shape). The card shows a five segment progress bar at the top (Details, Terms, Payment, Review, Done; segments up to the current step filled, all five on the receipt), with the step named for screen readers as "Step N of 4: <name>" (the receipt as "Booking confirmed"). The picks show as a **Selected courts and slots** card: one row per run of adjacent picks on a court ("Court 1", the day from `formatDayHeading`, "9pm to 11pm", and an hours chip "2 hr"), then a fee line "Court hours (N)" with its amount, then "Total" with the total. The full card shows on Details and Review; Terms and Payment show one summary line under the header ("Fri 30 Oct · 3 hours · ₱750"). Pressing Book still sends `booking_intent` as today. The picks are fixed for the life of the card; changing them means closing it.
- **AC-2**: **Details step.** Three required fields: name (1 to 80 characters after trimming), phone (a Philippine mobile, accepted as `09XX XXX XXXX` or `+63 9XX XXX XXXX` with any spaces or dashes, stored as `+639XXXXXXXXX`), and email (a valid address up to 254 characters). Next validates every field, marks each invalid one with a message tied to it (`aria-invalid`, `aria-describedby`), and moves focus to the first. Back from any later step returns with every typed value intact.
- **AC-3**: **Terms step.** Shows the booking rules from `BOOKING_RULES` in `lib/legal/constants.ts` as a short list in a bordered box that scrolls on its own past about 10rem, then three separate checkboxes, each with its whole label as the target (at least 44 pixels): (1) "I agree to the venue's booking rules above."; (2) "I agree to the site's Terms (governed by the laws of the Philippines).", with "Terms" a link to `/terms` in a new tab; (3) "I consent to the collection and use of my details as described in the Privacy notice, under the Data Privacy Act of 2012 (Republic Act No. 10173).", with "Privacy notice" a link to `/privacy` in a new tab. Below them, the Turnstile widget (managed mode, action `booking_hold`). Next, labelled "Next: Pay", stays disabled until all three are ticked and Turnstile has issued a token. `holdOnlineBooking` takes `consent: { rules: true, terms: true, privacy: true }` (each a Zod literal `true`) in place of `termsAccepted`, and refuses `invalid` otherwise; the booking still stores `BOOKING_TERMS_VERSION` and `terms_accepted_at` (no schema change). Ticks survive Back and a re hold.
- **AC-4**: **The hold.** Next on Terms calls `holdOnlineBooking`. In one transaction, `hold_online_booking` checks every pick (a live court, the day inside the booking window and not closed, the slot aligned to that day's `venue_hours` and `slot_minutes`, and its start after `now()`), writes one `booking` row (status `held`, `hold_expires_at = now() + 5 minutes`, a new code, the amount, and `proof_path` set to the issued upload path `<booking id>/<submission id>`) and one `reservation` row per run of adjacent picks on a court (kind `booking`, status `active`, the name and phone copied, that run's own amount, `payment_status 'unpaid'`, `created_by` null, `booking_id` set). The sheet moves to Payment, and both boards show the held slots Booked within their usual live delay.
- **AC-5**: **One hold per sheet.** The sheet makes a random `submission_id` (UUID v4) when it opens and sends it with every call. Calling the hold again with the same `submission_id` while its hold is live (Back to Details, edit, Next again) updates the name, phone and email on the booking and its rows in place and returns the same code and the **same** `hold_expires_at`; the 5 minutes never restart. Each hold call still needs a fresh Turnstile token.
- **AC-6**: **A slot taken first.** If any pick is already taken when the hold runs (found by the check, or by the `reservation_no_overlap` constraint in a race), nothing is written. The result names every taken slot; the card closes; the picker reads the day again so the taken tiles show Booked while the rest stay picked with the total updated; and one toast names them ("Court 2 at 6pm was just booked.").
- **AC-7**: **Other refusals at the hold.** A pick that is past, out of hours, on a closed day, or outside the window closes the card the same way with a toast saying the hours changed. A rate limit refusal (AC-19) keeps the card on Terms with "Too many tries from this connection. Try again in N minutes, or message us." and the Messenger and Text us buttons. A Turnstile token that fails Siteverify, or a widget that fails to load, gets one quiet retry of the widget; if that fails too, the Terms step says online booking cannot continue on this device and offers Messenger and Text us, with the Text us body prefilled by `smsBody()`. No refusal writes anything.
- **AC-8**: **Payment step.** Shows the venue's GCash QR image (`PAYMENT_QR_SRC`, with alt text "GCash QR code to pay <account name>"), the account name (`PAYMENT_ACCOUNT_NAME`), "Send exactly ₱1,000" from the hold's amount, and the hold banner (AC-27): "Your slots are held for you" with a time chip "4:12", computed from `hold_expires_at` and the server's `now` returned with the hold (never the device clock alone). The banner shows from Payment through Review, pinned above the header, never on the receipt. Two fields: the last 4 digits of the transfer's reference number (exactly 4 digits) and the transfer screenshot (PNG, JPEG or WebP, up to 10 MB chosen). Next is disabled until the digits are valid and the upload has finished. **Amended 2026-10-02 (second):** the booking code is not shown on Payment; the player first sees it on the receipt, once the booking is confirmed.
- **AC-9**: **The screenshot.** On choosing a file, the browser shrinks it to at most 1600 pixels on the long edge and encodes it as WebP (JPEG where the browser cannot encode WebP), then uploads it straight to the private `payment-proof` bucket with a `fetch` PUT to the signed upload URL the hold returned (made with `upsert: true`, valid for Supabase's fixed 2 hours, so it outlives the hold), with the file's real content type. The path carries no extension. Replace and Retry upload again to the same path, overwriting. The step shows a thumbnail, progress, a Replace button, and on failure a Retry button. A file of the wrong type or over 10 MB is refused on the field before any upload.
- **AC-10**: **The countdown runs out.** At zero the hold banner's line changes to "Your hold ended. You can still confirm, and we'll book the slots if they're still free." The player can carry on; nothing else changes on screen. A screen reader hears the countdown only at 1 minute left and at zero (a polite live region), never every second.
- **AC-11**: **Review step.** Three grouped cards under small caps labels: **Booking details** (the Selected courts and slots card, AC-1), **Your details** (name, phone, email) and **Payment** (method "GCash transfer" from `PAYMENT_METHOD_LABEL`, reference "•••• 1234", and the screenshot thumbnail with "Screenshot attached"). Your details and Payment each carry an Edit button (at least 44 by 44 pixels) that jumps to its step. The button reads "Confirm booking".
- **AC-12**: **Confirm.** Calls `submitOnlineBooking` with the `submission_id` and the digits (never a path). `submit_online_booking` checks an object exists in `payment-proof` at the booking's own `proof_path`, then: if the hold is live, sets status `pending_check`, the digits and `submitted_at` (`hold_expires_at` stays as a record of when the hold would have ended). If the hold has expired, it tries to take the same slots again, all or nothing, requiring each to be free and not yet ended; on success it inserts fresh rows, sets `pending_check` the same way, and keeps the amount from the hold. Confirm is disabled while the call runs; the same call repeated returns the same result and never books twice.
- **AC-13**: **Confirm after expiry, a slot gone.** Nothing is booked, but the digits and `submitted_at` are saved (the proof is already at `proof_path`) on the booking, which stays `expired`, so staff can find the payment. The card names the taken slots (in the body of the Review step, with the hold banner hidden, since no hold is live) and says "You've already paid, so message us with your code K7MQ-3XPT and the reference digits and we'll refund you or move your booking." with Messenger and Text us, the Text us body prefilled with the code and digits.
- **AC-14**: **Receipt step.** The full receipt, centered under a round check badge, titled "Booking confirmed" with "Your code is how you find your booking." under it; "Your booking code" and the code large, grouped `XXXX-XXXX`, with a Copy button; the Selected courts and slots card (AC-1); **Customer** (name, phone, email); **Payment** (method "GCash transfer" from `PAYMENT_METHOD_LABEL`, reference "•••• 1234", "Screenshot received", and the time it was submitted in `Asia/Manila`); "Total paid" with the amount; a status chip with a check icon reading "Confirmed"; the line "Staff check every payment. If yours doesn't match, we'll message you."; and a "Save as image" button (amended 2026-10-02, second: pulled forward from feature 18), which draws the receipt's facts as a PNG in the browser and hands it to the share sheet on a phone ("Save Image" puts it in Photos) or downloads it elsewhere. Done closes the card, clears the picks and reads the day again. Closing from the receipt releases nothing. **The word is for the player only:** the booking stays `pending_check` in the database and reads "Payment not yet checked" to staff (AC-21) until feature 17's check; the receipt is shown for every successful submit, live or retaken, and never for a refusal.
- **AC-15**: **Close releases.** Closing the card while a hold is live (by the close button, Escape, or a tap on the overlay) calls `releaseOnlineBooking`, which sets the booking `expired` and cancels its rows, so the slots free on both boards straight away. From Payment or Review, if digits were typed or a screenshot uploaded, a confirm dialog asks "Leave checkout? Your held slots will be released." first. Closing before any hold exists just closes.
- **AC-16**: **Expiry.** A `pg_cron` job every minute runs `expire_online_holds()`, which sets every `held` booking past its `hold_expires_at` to `expired` and cancels its rows. `hold_online_booking` also expires any lapsed hold overlapping its picks before checking them, so a lapsed hold never blocks a new one. Every `held` to `expired` change (the job, a close, the cleanup) leaves `hold_expires_at` as it was. The usage report's day list (`getDayReservations()` in `lib/report/queries.ts`) leaves out every row with `status = 'cancelled'`, a `booking_id`, and a null `cancelled_by`: the rows the system cancelled (an expiry, a release, a retaken booking's first rows), never a staff cancel. Abandoned checkouts are not listed as cancelled bookings.
- **AC-17**: **The price.** `venue_settings` gains `hourly_rate` (seeded 250). The amount is computed only inside `hold_online_booking`: runs times hours times `hourly_rate`, stored on the booking with the rate used; each row carries its own share, and the rows add up to the booking's amount. The client sends no price. `PRICE_PER_HOUR` is removed: the landing total, the offers card, the hero stat and the lede read `hourly_rate` from the schedule read instead. A rate change during a live hold does not change that hold's amount.
- **AC-18**: **The code.** Every booking has one code: 8 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, drawn in Postgres from `gen_random_bytes`, unique (drawn again on a clash), stored without the dash and shown as `XXXX-XXXX`. Every reservation row of the booking shares its `booking_id`.
- **AC-19**: **Spam limits.** Every hold call needs a Turnstile token that passes Siteverify with `success`, action `booking_hold`, and a hostname in `TURNSTILE_HOSTNAMES`, failing closed on any Siteverify error or timeout (10 seconds). `hold_online_booking` refuses a sixth new hold from the same client hash within 15 minutes, returning the seconds until the oldest one ages out. A request with no client address is hashed from the fixed string `unknown`, so all such requests share one limit rather than escaping it. Only one hold may be live per `submission_id`.
- **AC-20**: **Nothing new is public.** `anon` gains no grant. The `booking` table has no `anon` grant. `hold_online_booking`, `submit_online_booking` and `release_online_booking` are executable only by the role `online_booking`, which the server reaches with a 60 second token it mints after its own checks. The `payment-proof` bucket is private; `online_booking` may only write (and read back, which an overwrite needs) the one object at a booking's `proof_path`, and only while that booking has no `submitted_at`. No page, JSON response or broadcast that anyone other than the player can reach carries an email, reference digits, proof path, code, or client hash (the player's own action results carry their own code and digits, for the receipt). A database test shows the anon key refused on each function, on `booking`, and on reading a proof.
- **AC-21**: **Staff see it.** The staff details sheet for a reservation with a `booking_id` shows "Online booking" with its state ("Held, not yet paid", "Payment not yet checked", or "Expired"), the code, the email and the reference digits, read by active staff through a new staff read of `booking`. Where `created_by` is null it reads "Booked online" instead of a staff name. The board's cell styling does not change (feature 17).
- **AC-22**: **Privacy and terms.** `/privacy` names the email, the reference digits and the payment screenshot, what each is for, and how long each is kept (AC-23), with the numbers from constants in `lib/legal/constants.ts`. `/terms` gains a booking section matching `BOOKING_RULES`. `BOOKING_TERMS_VERSION` is stored on every booking with the time the boxes were ticked. `PRIVACY_NOTICE_VERSION` is bumped so staff acknowledge the new data they will handle. **Amended 2026-10-02:** the first rule changes from "Your booking is confirmed once staff check your payment." to "Your booking is confirmed when you finish checkout. Staff check every payment afterwards, and may cancel a booking whose payment doesn't match; we'll message you first, and refund anything you paid." The other three rules stay. `BOOKING_TERMS_VERSION` becomes `2026-10-02`, so every booking from then on records the new wording; bookings made before keep `2026-09-30`. `/terms` and the Terms step read the rules from the constant, so both follow. **Amended 2026-10-04:** the booking rule on paying names the method as GCash transfer, so `BOOKING_TERMS_VERSION` moves to `2026-10-04`; bookings made before keep `2026-10-02`.
- **AC-23**: **Retention, enforced.** A nightly job clears `customer_phone`, `customer_email` and `reference_last4` from `booking` 90 days after the booking's last slot ends, and `client_hash` one day after the booking was made. The payment screenshot is deleted 30 days after `decided_at` (feature 17), or 90 days after the last slot ends if never decided, or one day after the hold if the booking was never submitted (found by `proof_path` set and `submitted_at` null, whether or not a file was ever uploaded), by a Supabase Edge Function `purge-payment-proofs` that `pg_cron` calls nightly through `pg_net`; it deletes through the Storage API and then sets `proof_path` null.
- **AC-24**: **Analytics.** After each successful write, and never awaited, the server sends one cookieless event through a new `capturePublicEvent()`: `online_booking_held` `{ slots, courts, days_ahead }`, `online_booking_submitted` `{ slots, retaken }`, and on a refusal `online_booking_refused` `{ stage: "hold" | "submit", reason }` with `reason` one of `slot_taken`, `out_of_range`, `rate_limited`, `bot_check`, `proof_missing`. Each is added to the allow list in `lib/analytics/properties.ts` with a `.strict()` schema and carries no personal data. `invalid` and `not_found` results are logged with `console.warn` only, never sent. Unexpected failures (`failed`) go through `reportFailure()`, scrubbed.
- **AC-25**: **Look, motion and access.** The card is built to `docs/design.md` and the landing page's look and motion (the `apple-design`, `emil-design-eng` and `animate` skills): the card enters from `scale(0.96)` and opacity 0 over `--dur-step` with `--curve-out` and leaves faster; steps slide and fade forward and back; pressable controls scale to 0.97 on press; with reduced motion the card and the steps only fade or swap in place. On each step change focus moves to the step's heading. Every control is reachable and usable from the keyboard, every target is at least 44 pixels tall, and the whole flow works at 360 pixels wide with no sideways page scroll. Status never relies on colour alone.
- **AC-27**: **The card.** A Radix dialog (`components/ui/dialog.tsx`), centered on every width, `max-width: 28rem`, a 16 pixel gap to the viewport edges at 360 pixels, `max-height: calc(100dvh - 32px)`, corners at `--radius-2xl` or larger. Top to bottom: the progress bar; the hold banner (Payment and Review only, AC-8); the header (an icon tile, the step heading, a one line subtitle, a back arrow from Terms through Review labelled "Back to <previous step>", and the close button); the body, the only part that scrolls; and a footer pinned at the bottom (Details: "Cancel" and "Next"; Terms through Review: "Back" and the primary; the receipt: one full width "Done"). The headings and subtitles: Details "Your details" / "Who's playing, and how we reach you."; Terms "Booking rules" / "Read and accept before you pay."; Payment "Pay by GCash" / "Scan with your GCash app." (amended 2026-10-04: GCash is the one way players are told to pay, so every receipt and the staff check view can name it); Review "Check and confirm" / "Make sure everything is right."; the receipt as AC-14. The overlay behind it uses a new `--overlay-soft` token (about 35% of a dark neutral) with a 6 pixel backdrop blur, so the board stays legible behind; `--overlay` and every staff sheet are unchanged. "Cancel" before a hold just closes; after a hold it behaves as AC-15. The header back arrow and the footer "Back" call the same handler and do exactly the same thing (both kept on purpose: the arrow for a quick reach, the footer for the thumb). The hold banner is hidden whenever the refund message (AC-13) shows. **Focus on close:** however the card closes (Done, close button, Escape, overlay, Cancel, a refusal that closes it, AC-6 and AC-7), `onCloseAutoFocus` is prevented and focus goes to the booking section's "Your booking" heading (made focusable with `tabIndex={-1}`), never to the page body. The "Leave checkout?" confirm (AC-15) uses `--overlay-soft` too, so stacking it on the card never jumps to the dark staff dim.
- **AC-26**: **The switch.** The landing page decides on the server, per request, whether checkout is on: every one of `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `TURNSTILE_HOSTNAMES`, `BOOKING_CLIENT_HASH_SECRET` is set, and neither `PAYMENT_ACCOUNT_NAME` nor `PAYMENT_QR_SRC` is a placeholder (`isPlaceholder()`). It passes the picker a boolean only, never a secret. While it is off, the button keeps today's "Request booking" label and coming soon toast (spec 0013, AC-13) exactly.

## Decision

**Chosen option**: Option 2: A server gated write through a dedicated `online_booking` Postgres role, with a 5 minute hold taken on the way to payment.

The browser never talks to the booking functions: a public Server Action checks Turnstile and Zod, mints a 60 second token for a role that may only run three functions and upload one file, and Postgres does every real check (slots, hours, price, overlaps, rate limit).

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `turnstile-spin` (`cloudflare/skills`, `.agents/skills/turnstile-spin/`) · `zod` (`pproenca/dot-skills`, `.agents/skills/zod/`) · `react-hook-form` (`.claude/skills/react-hook-form/`) · `shadcn` (`shadcn/ui`, `.agents/skills/shadcn/`) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`) · `apple-design`, `emil-design-eng`, `animate` (the slice 7 look and motion) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `playwright-cli` (`microsoft/playwright-cli`, `.agents/skills/playwright-cli/`)

Settled while writing (each with its runner up):

- **Where the actions live**: `lib/booking/actions.ts` (`"use server"`, `import "server-only"`), a second named exception to "`requireStaff()` first" beside `lib/auth/actions.ts`: its gate is Turnstile (hold) or the unguessable `submission_id` (submit, release), then Zod, then the minted role write. Runner up: route handlers, which would duplicate the action plumbing the landing page already uses.
- **Where the token is minted**: a second fixed minter, `mintOnlineBookingToken(clientHash)`, in `lib/supabase/staff-token.ts`, so `SUPABASE_JWT_SECRET` keeps exactly one reader. It signs `role: "online_booking"`, a `client_hash` claim, no `sub`, and a 60 second life, and cannot mint anything else. Runner up: a new module reading the secret, which breaks the single reader rule for no gain.
- **The `submission_id` is the capability** for submit and release: 122 random bits, never shown, held only in the sheet's memory. Runner up: a separate hold secret, which adds a column and says nothing more.
- **Runs, not slots, become rows**: adjacent picks on one court merge into one reservation row, as staff `createReservations` does. Runner up: a row per slot, which splits one booking into many cells on the staff board.
- **A retake needs slots not yet ended**, not not yet started: the player has already paid, and a booking that began two minutes ago is still worth having. Runner up: not yet started, the hold rule, which would refuse a paid player over minutes.
- **The functions answer with `jsonb`** (`{ ok: true, ... }` or `{ ok: false, reason, slots }`) for every business refusal, and raise only on bugs. Taken slots are found first by a plain SELECT against active rows, so the usual clash inserts nothing. Every insert (the booking and all its runs) then sits inside one outer `begin ... exception when exclusion_violation` block; a race that trips `reservation_no_overlap` rolls back that whole block, the SELECT runs again to name the slot the other writer took, and the function answers `slot_taken`. Runner up: raising a coded exception for each refusal, which PostgREST flattens into a message string to parse.
- **The client hash** is HMAC SHA256 of `clientAddress()` (the helper `proxy.ts` uses), or of the string `unknown` when it returns null, keyed by `BOOKING_CLIENT_HASH_SECRET`, computed in the action. Runner up: a plain hash, which anyone can reverse over the IPv4 space.
- **One proof object per booking, at a path fixed at hold time**: `<booking id>/<submission id>`, no extension, overwritten by Replace. Recording it on the booking at the hold is what lets the purge find a screenshot that was never confirmed. Runner up: a fresh path per upload, which leaves every replaced file behind for the purge to hunt.
- **The browser upload is a plain `fetch` PUT** to the signed URL, not `browserSupabase()`, so "the browser client only listens" still holds.
- **Expired covers release**: closing the sheet and the timer both end in `expired`; the analytics event, not the status, tells them apart. Runner up: a separate `released` status, which no reader needs.
- **Staff may still Edit or Cancel an online row** from the board, as with any booking; the header is not reconciled in this feature (Consequences).

Settled by the 2026-10-02 amendment (the engineer chose the first four; the rest were settled while writing, each with its runner up):

- **The player reads "Confirmed" at the receipt; staff read "Payment not yet checked".** The rules change to match, so the word is a promise the venue keeps: the slot is the player's unless the payment fails the check, and then the venue messages and refunds first. Runner up: "Booking received", honest under the old rule but reads as uncertain to a player who has already paid.
- **A centered card on every width**, built on `components/ui/dialog.tsx`, for checkout only. Runner up: card from `md`, bottom sheet on a phone, which reaches the thumb better but is not the look the engineer wants.
- **Turnstile once, on Terms**, unchanged. Confirm is already gated by the live `submission_id`, the minted 60 second token, and a proof that must exist.
- **Three consent boxes**, each its own Zod literal in the action, so a direct call cannot skip one. Runner up: one box, fewer taps, but folds a Data Privacy Act consent into a terms tick.
- **A soft overlay token for checkout only** (`--overlay-soft`), not a change to `--overlay`. Runner up: lighten `--overlay` everywhere, which also lightens every staff sheet where the dark dim keeps the grid out of the way.
- **No new column for the consents.** `BOOKING_TERMS_VERSION` with `terms_accepted_at` records what was agreed and when, and the three boxes cannot be submitted separately. Runner up: a `consents jsonb` column, a migration for no reader.
- **"Booking code" stays the name**, not "tracking number", because the rules, the refund message, the staff sheet and feature 18's lookup all say code.
- **The fee line stays beside the total** although they match today, because feature 19's discount line goes between them.

## Feature design

**Data model sketch**

`booking` (new; one row per booking; no `anon` grant; written only by the three functions below and, from feature 17, by staff):

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | bigint identity | no | PK |
| `code` | text | no | unique; 8 characters from the alphabet in AC-18 (check) |
| `source` | text | no | `online` or `desk` (check), default `online`; only `online` is written now |
| `status` | text | no | `held`, `pending_check`, `confirmed`, `rejected`, `expired`, `cancelled` (check) |
| `customer_name` | text | no | 1 to 80 after trim (same check as `reservation`) |
| `customer_phone` | text | yes | `+639` then 9 digits (check); required by the hold function; cleared at 90 days |
| `customer_email` | text | yes | up to 254 (check); required by the hold function; cleared at 90 days |
| `reference_last4` | text | yes | exactly 4 digits (check); cleared at 90 days |
| `proof_path` | text | yes | the issued object path in `payment-proof`, `<booking id>/<submission id>`, set by the hold (before any upload); set null by the proof purge |
| `amount` | numeric(10,2) | no | at least 0 |
| `hourly_rate` | numeric(10,2) | no | the rate the amount used |
| `hold_expires_at` | timestamptz | yes | not null whenever status is `held` (check, one way); kept afterwards as a record, never cleared |
| `terms_version` | text | no | `BOOKING_TERMS_VERSION` |
| `terms_accepted_at` | timestamptz | no | set by the hold function to `now()` |
| `submission_id` | uuid | no | unique |
| `submitted_at` | timestamptz | yes | not null whenever status is `pending_check`, `confirmed` or `rejected` (check) |
| `client_hash` | text | yes | cleared after one day; indexed with `created_at` for the rate limit |
| `decided_at` | timestamptz | yes | feature 17 writes it |
| `decided_by` | text | yes | FK `staff.user_id`; feature 17 writes it; indexed |
| `version` | integer | no | default 1 |
| `changed_by` | text | yes | FK `staff.user_id`; null for public writes; indexed |
| `created_at`, `updated_at` | timestamptz | no | `updated_at` by `set_updated_at()` |

Indexes: unique `code`, unique `submission_id`, `(client_hash, created_at)`, `(status, hold_expires_at)` where `status = 'held'`, and the FK columns.

`reservation` (changed): `booking_id bigint null references booking (id)`, indexed. One booking has one or more reservations (1:N); a desk booking has none yet. Online rows copy `customer_name` and `customer_phone`, so every existing read, `purge_customer_phones()`, and the reports work unchanged.

`venue_settings` (changed): `hourly_rate numeric(10,2) not null default 250`, check above 0. Readable by `anon` like the rest of the row.

Storage: a private bucket `payment-proof` (created in the migration), 10 MB object limit, types `image/webp` and `image/jpeg`. Path `<booking id>/<submission id>`, no extension; the content type is stored with the object.

Role: `online_booking` (`nologin`), granted to `authenticator` so the API can switch to it. It holds `execute` on the three functions and `insert`, `update` and `select` policies on `storage.objects` whose test is: bucket `payment-proof`, and `name` equals the `proof_path` of a booking with `submitted_at` null (whatever its status, so a slow payer can still upload after the hold lapses). It holds nothing else.

**State transitions**

```
booking.status
  (hold)        → held
  held          → pending_check   submit while the hold is live
  held          → expired         the minute job, a close, or a newer hold's cleanup
  expired       → pending_check   submit after expiry, every slot still free (retake)
  expired       → expired         submit after expiry, a slot gone: proof and digits saved, refund owed
  pending_check → confirmed | rejected    feature 17
  confirmed     → cancelled               a later feature
```

Rows are `active` while the booking is `held`, `pending_check` or `confirmed`; the functions cancel them on the way to `expired` (and feature 17 on `rejected`). A retake inserts new rows; the old cancelled ones stay linked.

**API surface**

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
| --- | --- | --- | --- | --- | --- |
| `holdOnlineBooking` (`lib/booking/actions.ts`) | Server Action | `submissionId: uuid`, `date: YYYY-MM-DD`, `picks: { courtId, startsAt }[]` (1 or more), `name`, `phone`, `email`, `consent: { rules: true, terms: true, privacy: true }`, `turnstileToken` | `code`, `holdExpiresAt`, `serverNow`, `amount`, `runs`, `upload: { signedUrl }` | public; Turnstile, then the minted `online_booking` token | `slot_taken { slots }`, `out_of_range`, `rate_limited { retryAfterSeconds }`, `bot_check`, `invalid` (Zod), `failed` |
| `submitOnlineBooking` | Server Action | `submissionId`, `referenceLast4: /^\d{4}$/` | the receipt: `code`, `status`, `runs`, `amount`, `customer`, `payment { referenceLast4, submittedAt }`, `retaken` | public; `submissionId` as capability, minted token | `slot_taken { slots }` (after expiry), `proof_missing`, `not_found`, `invalid`, `failed` |
| `releaseOnlineBooking` | Server Action | `submissionId` | `{ released: boolean }` | public; as above | none shown; a failure is logged and the timer frees the slots |
| `public.hold_online_booking(p_submission_id uuid, p_day date, p_picks jsonb, p_name text, p_phone text, p_email text, p_terms_version text)` | RPC, `security definer`, `search_path = ''` | the hold inputs; `client_hash` read from `auth.jwt()` | `jsonb` result | `online_booking` only | refusals as `jsonb` |
| `public.submit_online_booking(p_submission_id uuid, p_reference_last4 text)` | RPC, as above | | `jsonb` receipt | `online_booking` only | refusals as `jsonb` |
| `public.release_online_booking(p_submission_id uuid)` | RPC, as above | | `jsonb` | `online_booking` only | |
| `public.expire_online_holds()` | `pg_cron`, every minute | | count | no grant | |
| `public.purge_online_booking_details()` | `pg_cron`, nightly beside the phone purge | | count | no grant | |
| `public.payment_proofs_due()` | read by the Edge Function | | paths due for deletion | `service_role` only | |
| `purge-payment-proofs` (Supabase Edge Function) | POST from `pg_net`, nightly | header `x-purge-secret` | `{ deleted }` | shared secret | 401 on a wrong secret |
| `getBookingForStaff(bookingId)` (`lib/schedule/queries.ts`) | server read | `bookingId` | code, status, email, digits | active staff (`requireStaff()`, RLS) | |

The signed upload URL is made by the hold action with the same minted token (`storage.from("payment-proof").createSignedUploadUrl(proofPath, { upsert: true })`), after the hold function returns the booking id and `proof_path`. Supabase fixes its life at 2 hours. A repeat hold call for the same `submission_id` returns a fresh URL for the same path.

`getDayReservations()` in `lib/report/queries.ts` changes too: it drops rows with `status = 'cancelled' and booking_id is not null and cancelled_by is null` (AC-16).

**Value sourcing**

| Action | Value produced / displayed | Source |
| --- | --- | --- |
| Selected courts and slots card | one row per run, its day, time range and hours, the fee line, the total | the picks merged into runs the same way the hold does (adjacent slots on one court), labelled with `formatDayHeading` and the grid's slot labels, end times through `localEndTimeInZone()` rules (`24:00` shows as midnight's end, never `00:00`); amounts from `hourly_rate` on the schedule read (AC-17) until the hold answers, then the hold's own `amount` and `runs` |
| Summary line (Terms, Payment) | day, hours, amount | the one picked day (`formatDayHeading`); hours = every picked slot's length summed across all courts and runs, in hours (3 picks of 60 minutes = "3 hours", "1 hour" when one); the amount from the same source as the full card |
| Card | `submission_id` | `crypto.randomUUID()` when the card opens |
| Progress bar, header | step names, headings, subtitles, icons | constants beside the checkout component (AC-27); Phosphor icons from the main entry (the card is a Client Component) |
| Terms | rules, terms version | `BOOKING_RULES`, `BOOKING_TERMS_VERSION` in `lib/legal/constants.ts` (the action sets the version, not the browser) |
| Terms | the three consent ticks | the card's own form state, sent as `consent`, checked by Zod in the action (AC-3) |
| Receipt | "Confirmed" and the status chip | fixed copy shown for any successful submit result; never read from `booking.status`, which stays `pending_check` |
| Overlay | dim and blur | `--overlay-soft` in `app/globals.css` (new), beside `--overlay` |
| Hold | client hash | HMAC of `clientAddress()` (or `unknown` when null) with `BOOKING_CLIENT_HASH_SECRET`, carried in the token claim |
| Hold | slot validity | `court.retired_at`, `venue_hours` for `extract(dow)` of the day, `venue_settings.slot_minutes`, `booking_horizon_days`, `timezone`, and `now()` |
| Hold | amount, rate | `venue_settings.hourly_rate` times total hours, in the function |
| Hold | code | `gen_random_bytes` over the AC-18 alphabet, in the function |
| Hold | `hold_expires_at`, `serverNow` | `now() + interval '5 minutes'`, `now()` |
| Hold | upload path and URL | `booking.proof_path` (`<booking id>/<submission id>`), written by the function; Storage signed upload URL with `upsert` |
| Payment | QR, account name | `PAYMENT_QR_SRC` (`public/payment-qr.png`), `PAYMENT_ACCOUNT_NAME` in `lib/venue.ts`, supplied by Ella |
| Payment | countdown | `holdExpiresAt` minus (`serverNow` plus the time since the answer arrived) |
| Submit | proof exists | `storage.objects` row at `bucket_id = 'payment-proof'` and `name = booking.proof_path`, read inside the function; no path comes from the browser |
| Report day list | which cancelled rows to hide | `status`, `booking_id`, `cancelled_by` on `reservation` (AC-16) |
| Receipt | status, runs, amount, customer, digits, submitted time | the submit result (`booking` columns and its active rows), times shown in `Asia/Manila` |
| Review, receipt | payment method | `PAYMENT_METHOD_LABEL` ("GCash transfer") in `lib/booking/constants.ts`, the one copy `/booking` and the staff check view also read |
| Refusal toast | taken slots | the function's `slots` (court id and start), labelled with the grid's court names and `formatSlotLabel` |
| Staff sheet | state, code, email, digits | `booking` by `reservation.booking_id`, staff read |
| Privacy page | what is kept and for how long | `PHONE_RETENTION_DAYS`, new `EMAIL_RETENTION_DAYS`, `REFERENCE_RETENTION_DAYS`, `PROOF_RETENTION_DAYS_AFTER_DECISION` in `lib/legal/constants.ts`; the SQL uses the same numbers, and a test pins them equal |
| Checkout switch | on or off | decided in `app/(landing)/page.tsx` on the server: the four checkout env values set, and `isPlaceholder()` false for `PAYMENT_ACCOUNT_NAME` and `PAYMENT_QR_SRC`; a boolean prop to the picker |

**Key invariants**

1. `reservation_no_overlap` is unchanged: a hold blocks a slot exactly as a desk booking does, and two racing holds cannot both win.
2. The price is never an input. `booking.amount` equals the sum of its first set of rows' amounts, and equals runs times hours times the `hourly_rate` read at hold time.
3. `hold_expires_at` is set whenever status is `held`, and never cleared; `submitted_at` is set whenever status is `pending_check`, `confirmed` or `rejected` (both one way checks).
3a. A refused hold or retake writes nothing: taken slots are found before any insert, and a race rolls back the whole insert block.
3b. The proof path is fixed by the database at hold time; the browser never names a path, and only an unsubmitted booking's one path is writable.
4. The functions never leave an `active` row on an `expired` booking.
5. At most one booking per `submission_id`; at most 5 bookings per `client_hash` created in any 15 minutes.
6. `anon` has no path to `booking`, the three functions, or the proof bucket; `online_booking` has no path to anything else.
7. Nothing personal rides the `schedule` broadcast: the existing `reservation_broadcast()` payload is unchanged, and `booking` gets no broadcast trigger in this feature.
8. The retention numbers on `/privacy` and in the SQL are the same numbers.

**Security model**

- **Players** (no account) reach only the three Server Actions. The hold is gated by Turnstile and the database rate limit; submit and release by the `submission_id`.
- **The server** mints the `online_booking` token only inside `lib/booking/actions.ts`, after its checks, for 60 seconds. The token can run three functions and add one file, so a leaked token is worth one minute of that.
- **Staff** read `booking` through a new policy for active staff (`private.is_active_staff()`); no staff write policy on `booking` in this feature. Staff read proofs from feature 17 on, through signed URLs.
- **The Edge Function** uses the Supabase provided service role inside Supabase only; nothing under `app/` or `lib/` reads it.
- **Compliance scope**: the Philippine Data Privacy Act of 2012. New personal data (email, reference digits, a payment screenshot that may show a name, number or balance) is collected for a stated purpose, disclosed on `/privacy`, and deleted on a schedule the database enforces (AC-22, AC-23). Every change to a reservation is already audited by `reservation_audit`; `booking` changes are traced by `changed_by`, `submitted_at`, `decided_at` and `decided_by`.

**Configuration required**

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: the Turnstile widget's site key (public). Cloudflare's test key `1x00000000000000000000AA` in development and tests.
- `TURNSTILE_SECRET`: the widget's secret, for Siteverify (server only).
- `TURNSTILE_HOSTNAMES`: comma separated hostnames Siteverify must report; the production value never includes `localhost`.
- `BOOKING_CLIENT_HASH_SECRET`: the HMAC key for the client hash (server only, 32 random bytes).
- `PROOF_PURGE_SECRET`: shared between the `pg_cron` call (kept in Supabase Vault) and the Edge Function's secrets.
- A Turnstile widget made in Cloudflare for the production host plus `localhost` (the `turnstile-spin` skill walks it).
- From Ella: the QR Ph image and the account name it pays.

**Critical test scenarios**

- Happy path: picks on `/`, Details, Terms, Payment with a real upload, Review, Confirm; the receipt shows the code; the slots read Booked on `/schedule` in a second browser before Confirm, and the staff details sheet shows "Payment not yet checked", verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-8**, **AC-9**, **AC-11**, **AC-12**, **AC-14**, **AC-21**
- Race: two sheets hold overlapping picks at once; exactly one wins, the other gets `slot_taken` naming the slot and nothing written, verifies **AC-6**
- Expiry and retake: let a hold lapse; the minute job frees the slot; Confirm then retakes it; with the slot taken in between instead, Confirm refuses, saves the proof and shows the refund message, verifies **AC-10**, **AC-12**, **AC-13**, **AC-16**
- Idempotency: Confirm sent twice, and the hold sent twice with edited details, give one booking and an unchanged expiry, verifies **AC-5**, **AC-12**
- Price: a direct call cannot pass a price; the amount follows `hourly_rate`; a rate change mid hold does not move it, verifies **AC-17**
- Auth and permission: the anon key calling each function, selecting `booking`, or reading a proof is refused; an `online_booking` token cannot select `reservation` columns beyond the anon grant or touch another booking's path, verifies **AC-20**
- Abuse: a sixth hold in 15 minutes from one client hash is refused with a wait; a bad or replayed Turnstile token is refused, verifies **AC-7**, **AC-19**
- Retention: the purge clears the fields at the stated ages and the Edge Function deletes due proofs, verifies **AC-23**
- The card: at 360 by 780 and at 1280 wide, the card is centered with the board legible behind it; the progress bar fills step by step; the hold banner appears on Payment and Review only; Next on Terms waits for all three boxes and Turnstile; the receipt reads "Booking confirmed" while the staff sheet for the same booking reads "Payment not yet checked"; a direct `holdOnlineBooking` call missing one consent answers `invalid`, verifies **AC-1**, **AC-3**, **AC-11**, **AC-14**, **AC-21**, **AC-27**

## Build plan

Tracer Bullet: the first task proves one real hold end to end (browser, action, minted role, Postgres, broadcast, both boards) including the one unproven platform assumption (Storage and PostgREST honouring a custom role), before any step is thickened.

1. **The thin thread.** Migration A: `booking`, `reservation.booking_id`, `venue_settings.hourly_rate`, the `online_booking` role and its grant to `authenticator`, the `payment-proof` bucket and its insert policy, `hold_online_booking` (validation, price, code, runs, the rate limit), the staff read policy, grants, `db advisors` clean, types regenerated. `mintOnlineBookingToken()` and `lib/booking/actions.ts` `holdOnlineBooking` without Turnstile yet. The sheet with Details and a bare Terms (checkbox only) whose Next holds and shows the code. Proven live: the held slot turns Booked on `/schedule` in a second browser, the hold action creates a signed upload URL under the custom role, a file uploads to it and a second upload to the same URL overwrites it (else fall back to a fresh URL per upload for the same path), and the anon key is refused on the function. If Storage refuses the custom role, stop and apply the fallback in Consequences before going on. Satisfies **AC-1**, **AC-2**, **AC-4**, **AC-17** (the function side), **AC-18**, **AC-20**
2. **The front door.** Turnstile on the Terms step (widget, Siteverify with action and hostname, fail closed), the client hash, the rate limit refusal, the `BOOKING_RULES` list and `/terms` link, the refusal and clash handling back into the picker, and the no Turnstile fallback. Satisfies **AC-3**, **AC-6**, **AC-7**, **AC-19**
3. **Pay and confirm.** The Payment step (QR, account name, amount, code, countdown from the server's clock), the image shrink and the signed upload with Replace and Retry, Review with Edit links, `submit_online_booking` and `submitOnlineBooking`, and the full receipt. Satisfies **AC-8**, **AC-9**, **AC-11**, **AC-12**, **AC-14**
4. **The hold's life.** `expire_online_holds()` and its minute job, the lapsed hold cleanup inside the hold, the same `submission_id` update in place, the countdown's end state, the retake and the refund path, `release_online_booking` with the close confirm dialog, and the `getDayReservations()` filter. Satisfies **AC-5**, **AC-10**, **AC-13**, **AC-15**, **AC-16**
5. **One price.** `hourly_rate` on the schedule read, the landing total, offers, hero stat and lede moved onto it, `PRICE_PER_HOUR` removed, and the checkout switch with its placeholders in `lib/venue.ts`. Satisfies **AC-17**, **AC-26**
6. **Staff see it.** `getBookingForStaff()`, the Online booking block in the details sheet, and "Booked online" where `created_by` is null. Satisfies **AC-21**
7. **Privacy and retention.** The retention constants, `/privacy` and `/terms`, the version bump, `purge_online_booking_details()` beside the phone purge, `payment_proofs_due()`, the `purge-payment-proofs` Edge Function, its `pg_net` schedule and Vault secret. Satisfies **AC-22**, **AC-23**
8. **Analytics.** `capturePublicEvent()`, the three events on the allow list, and scrubbed failure reports. Satisfies **AC-24**
9. **Finish.** Step motion and reduced motion, focus on step change, the countdown's live region, 360 pixel and keyboard passes, contrast; database tests for every function, grant and check (`npm run test:db`); unit tests for the schemas, phone normalising, code formatting, the image shrink and the action results; a real browser run of the critical scenarios; `npm run check` green. Satisfies **AC-25**, and re proves **AC-6**, **AC-12**, **AC-19**, **AC-20**
10. **The checkout card** (amendment 2026-10-02). Thin thread first: swap `BoardSheet` for the dialog shell with `--overlay-soft`, the progress bar, the header with its icon, subtitle and back arrow, and the pinned footer, around the steps as they are, and walk a real hold to the receipt before restyling any step. Then thicken: the Selected courts and slots card and the summary line; the Terms box with three consents, `consent` in the Zod schema and the action, the new first rule and `BOOKING_TERMS_VERSION` `2026-10-02`; the hold banner on Payment and Review; Review's three cards; the confirmed receipt. Finish with the card's enter and exit motion, press scale and reduced motion, the 360 pixel and keyboard passes, the unit tests that pin the old copy ("Booking received", the single checkbox, "Step N of 4" names) updated, and a browser run at 360 and 1280. No migration. Satisfies **AC-1**, **AC-3**, **AC-8**, **AC-10**, **AC-11**, **AC-14**, **AC-15**, **AC-22**, **AC-25**, **AC-27**

## Consequences

**Positive**

- Players book without a message, and cannot pay for a slot they then lose while the hold is live.
- Every rule that matters (price, hours, overlaps, rate limit, grants) is enforced in Postgres, so a caller who skips the app gets nothing.
- The `booking` header is the grouping the deferred "multi court booking" item wanted; desk bookings can adopt it later with no new table.

**Negative / tradeoffs**

- **A new kind of token.** `staff-token.ts` now mints two fixed token shapes. The rule "exports no way to mint anything but a five minute authenticated one" changes, and `lib/import-boundaries.test.ts` must pin `mintOnlineBookingToken` to `lib/booking/actions.ts`.
- **An unproven platform assumption.** PostgREST honours custom roles in a JWT, and Supabase Storage is expected to. If Storage refuses `online_booking`, the fallback is: mint `role: "authenticated"` with a `purpose: "online_booking"` claim and no `sub`; grant the three functions to `authenticated` and have each refuse unless the claim is present; key the storage policies on the claim as well as the path rule. Staff policies already require a `staff` row, so such a token gains nothing there. Task 1 decides which.
- **5 minutes is tight.** The engineer chose 5 over the recommended 10. A GCash transfer with an OTP often takes 3 to 5 minutes, so some payers will see the hold end; the retake (AC-12) covers them unless the slot was taken meanwhile, and then the venue owes a manual refund.
- **No size cap.** One visitor can hold a whole evening for 5 minutes at a time, up to 5 times per 15 minutes per address. Turnstile makes that costly, not impossible.
- **Abandoned checkouts flicker.** A slot reads Booked for up to 5 minutes (plus up to a minute for the job) while someone decides.
- **A second runtime.** The proof purge is a Supabase Edge Function, deployed with `npx supabase functions deploy`, outside the Next build and its tests.
- **Header drift.** Staff can still Edit or Cancel an online row from the board; the `booking` status does not follow until feature 17 reconciles it (a booking with no active rows reads as cancelled).
- **"Confirmed" before anyone checks the money** (amendment). A player with a wrong or missing transfer still sees Confirmed until staff act, and the venue carries the cost of messaging and cancelling. The new first rule makes that the stated deal, and feature 17 must give staff a fast way to cancel and message. Until feature 17 ships, a mismatch is found only by staff opening the details sheet.
- **A centered card on a phone** (amendment). With the keyboard up on Details, the card can have little room left; the body scrolls inside `100dvh`, but iOS Safari may still pan the page. The 360 pixel pass checks every field stays reachable with the keyboard open.
- **Two overlay strengths** (amendment). The checkout dims less than the staff sheets; that is deliberate, and recorded so nobody "fixes" one to match the other.
- **Named exceptions to project rules** that `/sync` must write into `AGENTS.md`: `lib/booking/actions.ts` does not call `requireStaff()`; its writes are keyed on `submission_id` rather than `version` and record no `changed_by`; its events go through `capturePublicEvent()`, not `captureStaffEvent()`.

**Neutral**

- `PRICE_PER_HOUR` disappears; spec 0013's AC-12, AC-16 and AC-17 now read the price from `hourly_rate`.
- The coming soon toast stays only as the "checkout off" state.
- Staff re-acknowledge the privacy notice once, because `PRIVACY_NOTICE_VERSION` is bumped.
- `pg_net` is enabled for the first time.

## Follow-up

- [ ] Ella supplies the QR Ph image and the account name it pays, and the wording of `BOOKING_RULES` (payment checked by staff, changes and refunds through Messenger, arrive on time); placeholders until then keep checkout off (AC-26).
- [ ] Make the Turnstile widget in Cloudflare for the production host and `localhost` (the `turnstile-spin` skill), and set the five env values on Vercel.
- [ ] `/sync`: record the named exceptions above, the second minter, `lib/booking/`, and the `turnstile-spin` skill (`.agents/skills/turnstile-spin/`, area specific, so a nested `lib/booking/AGENTS.md`, with a pointer from root). Record the Cloudflare MCP server as noted, not connected.
- [ ] Optional: connect the official Cloudflare MCP server (`github.com/cloudflare/mcp`) if you want to manage the Turnstile widget from here.
- [ ] Spec 0013: AC-13 becomes the "checkout off" state, and AC-12, AC-16, AC-17 read `hourly_rate`. Spec 0002: the `booking` table and `reservation.booking_id`. Spec 0010: the new retention rules. `/architect` amends each.
- [ ] Feature 17 decides: the board standout, confirm and reject writing `decided_at` and `decided_by`, reconciling the header when staff cancel a row, and how staff see expired bookings that carry a proof (refund owed).
- [ ] Feature 18 builds the lookup by code and the download; this feature's receipt layout is its starting point.
- [ ] Feature 19 adds the voucher field to the Details step and the discount inside `hold_online_booking`.
- [ ] Ella approves the new first booking rule (AC-22, amendment 2026-10-02) before checkout goes live; it changes what a player is promised.
- [ ] Feature 17: because the player already reads "Confirmed", staff need a quick cancel that messages the player when a payment does not match.
- [ ] Feature 18: the screenshots show "Save as image", "Save as PDF" and "Track this booking"; "Save as image" shipped with this feature (AC-14), so feature 18 adds the other two beside it.
- [ ] `/develop` appends the task 10 steps to `verify.md`; the task 1 to 9 steps that name the old copy ("Booking received", the single checkbox, the side sheet) are superseded by them.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
