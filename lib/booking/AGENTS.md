# Online booking

## Overview

The public write path behind the checkout card on `/` (spec 0015): a player holds
their picked hours for 5 minutes, pays by QR, uploads a screenshot, and confirms.
No player accounts. The only capability a player holds is the card's random
`submission_id`. Postgres does every real check (slots, hours, price, overlaps,
rate limit); this folder validates, gates and hands over.

## Key files

| File             | Owns                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `actions.ts`     | `holdOnlineBooking`, `submitOnlineBooking`, `releaseOnlineBooking`: the three public Server Actions, the only caller of `mintOnlineBookingToken()`. |
| `schemas.ts`     | Zod for every action input and every function answer; phone normalising to `+639XXXXXXXXX`; `consent` as three literal `true`s. |
| `turnstile.ts`   | `verifyTurnstile()`: Siteverify with action `booking_hold` and a hostname in `TURNSTILE_HOSTNAMES`, failing closed on any error or a 10 second timeout. |
| `client-hash.ts` | `hashClient()`: HMAC SHA256 of the client address (or `unknown`) with `BOOKING_CLIENT_HASH_SECRET`, for the database rate limit. |
| `switch.ts`      | `checkoutEnabled()`: on only when the four env values are set and the payment QR and account name in `lib/venue.ts` are not placeholders. |
| `proof.ts`       | The screenshot in the browser: type and size check, shrink to 1600 pixels as WebP (JPEG fallback), and a plain `fetch` PUT to the signed URL. |
| `types.ts`       | The result shapes the card reads. Plain types here, because a `"use server"` file may export only async functions. |
| `analytics.ts`   | Pure builders for the `online_booking_*` event properties.                                                     |
| `code.ts`, `constants.ts` | `formatBookingCode()` (`XXXX-XXXX`), the hold length, accepted proof types and sizes.                 |

The card itself lives in `components/landing/checkout-*.tsx`; the database side is
`supabase/migrations/20260929*_online_booking_*.sql` and the `purge-payment-proofs`
Edge Function.

## Conventions

- **`actions.ts` is the second named exception to "`requireStaff()` first"**, beside `lib/auth/actions.ts`. Its gate is Turnstile on the hold and the unguessable `submission_id` on submit and release, then Zod, then a write through a freshly minted 60 second `online_booking` token. Never `publicSupabase()` or `staffSupabase()` here.
- **Writes are keyed on `submission_id`, not `version`, and record no `changed_by`.** A repeat call with the same id updates in place or returns the same answer, so every action is safe to retry.
- **The browser never sends a price or a path.** The amount comes from `venue_settings.hourly_rate` inside `hold_online_booking`; the proof path is fixed by the database at hold time.
- **The database functions answer `jsonb` for every business refusal** (`{ ok: false, reason, slots }`) and raise only on bugs. Parse every answer through its schema in `schemas.ts`.
- **Events go through `capturePublicEvent()`, cookieless and never awaited**, after the write succeeds. `invalid` and `not_found` are logged with `console.warn` only; `failed` goes through `reportFailure()`.
- **The player's receipt says "Confirmed"; staff read "Payment not yet checked".** The booking stays `pending_check` until feature 17. The receipt's word is fixed copy, never `booking.status`.
- **Bump `BOOKING_TERMS_VERSION` in `lib/legal/constants.ts` whenever `BOOKING_RULES` changes.** The action stores it on every booking; the browser never sends it.

## Gotchas

- A Turnstile token is single use. The card asks for a fresh one after every hold call, success or not.
- A signed upload URL skips the storage policies, so a `storage.objects` trigger locks the proof once the booking has a `submitted_at`.
- Checkout stays off (the button reads "Request booking") until the real QR and account name replace the placeholders, even with every env value set.
- Turnstile's test site key `1x00000000000000000000AA` always passes, for development and browser runs.

## Agent skills

- [turnstile-spin](../../.agents/skills/turnstile-spin/): `cloudflare/skills`, setting up and repairing Cloudflare Turnstile, including server side Siteverify

MCP servers: cloudflare (recommended, not connected; manages the Turnstile widget from here)

## Related specs

- [0015 Online booking checkout](../../docs/specs/0015-online-booking-checkout/index.md)

_Drafted by /sync from the introducing change, worth a quick human pass._
