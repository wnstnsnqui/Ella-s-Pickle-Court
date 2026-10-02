# 0015. Online booking checkout: decision record

The reasoning behind [index.md](index.md). `/develop` does not read this file.

## Context

Until now only signed in staff write to the database. `anon` may read four columns of active reservations and nothing else, and every write policy keys on a `staff` row. Feature 16 (scope, slice 7) lets any visitor turn their picks on `/` into a real booking, so this is the project's first public write, tagged GA.

The forces that shaped it:

- **Payment happens outside the app, before Confirm.** The player pays by QR transfer and attaches a screenshot, then confirms. Without protection, a slot can be taken between paying and confirming, leaving a paid player with nothing and the venue owing a refund.
- **The anon key is public.** Anything granted to `anon` can be called directly with the key in the page source, skipping the app's rate limit, bot check and Zod. A booked slot blocks a real player, so spam here costs Ella money, not just noise.
- **Project rules** (`AGENTS.md`): Postgres is the enforcement point, the service role key never reaches `app/` or `lib/`, `SUPABASE_JWT_SECRET` has one reader, and the two Supabase clients never merge.
- **The price lives in TypeScript** (`PRICE_PER_HOUR`), where Postgres cannot see it, and the scope requires the price to be worked out on the server, never trusted from the browser.
- **New personal data**: email, reference digits, and a screenshot that may show a name, account number or balance. The Philippine Data Privacy Act asks for a stated purpose, disclosure, and deletion when the purpose ends. Supabase Storage files cannot be deleted from SQL, only through the Storage API.
- **Hosting**: Vercel today, so any in memory counter is per instance; a Docker move is planned.

## Options considered

### Option 1: Security definer functions granted to `anon`

The browser, or a Server Action with the anon client, calls `hold_online_booking` and friends; Postgres checks everything. Storage insert granted to `anon` on the proof bucket.

- **Pros**: fewest moving parts; no token minting; every rule still in Postgres.
- **Cons**: the rate limit and Turnstile run only in the app, so anyone with the public anon key can call the function directly and hold every court in a loop; a public upload policy lets anyone fill the bucket.

### Option 2: A dedicated `online_booking` role reached through a server minted token (chosen)

A Server Action checks Turnstile and Zod, then mints a 60 second token for a role that may only run three functions and add one file. Postgres does the real checks, including a rate limit keyed on a hashed client address carried in the token.

- **Pros**: nobody can skip the front door, since `anon` gains nothing; every rule stays in Postgres; the secret keeps one reader; works across Vercel instances and after the Docker move.
- **Cons**: a second token shape in the secret's module; relies on Supabase Storage honouring a custom role (a fallback is written down); more to build than Option 1.

### Option 3: A Supabase Edge Function with the service role key

The checkout posts to an Edge Function that verifies Turnstile and writes with the service role.

- **Pros**: the key stays out of `app/` and `lib/`; no custom role.
- **Cons**: the service role bypasses row level security, so every rule moves into TypeScript in a second runtime, against "Postgres is the enforcement point"; a second place to deploy, test and log.

Within the chosen option, the hold itself was weighed three ways: hold on the way to payment (chosen), book first and pay after (reorders the scope's steps and holds without any proof), or no hold with refunds by message (simplest, but a paid player can lose their slot).

## Rationale

The public anon key decides it. With Option 1, the database can refuse a bad price or a clash but cannot tell a real player from a script, because the only things that can (Turnstile, a per address limit) sit in the app and are skipped by calling Postgres directly. Option 2 puts the app's checks in front of the only door, and still lets Postgres enforce every rule, which is what `AGENTS.md` asks for. Option 3 gets the door right but gives up row level security to do it.

The hold answers the "paid before Confirm" force. Taking it on the Terms step's Next puts it exactly before money moves, and the retake on a late Confirm covers the common case of a slow payer whose slots nobody wanted. The engineer chose a 5 minute hold over the recommended 10 and no size cap, reasoning that a short hold limits the damage of any one bad actor. That trade is recorded in the spec's Consequences: some real payers will outlast 5 minutes, and a lost retake then needs a manual refund.

The rate limit lives in Postgres because an in memory counter on Vercel counts per instance, and a count the database keeps holds under any host. Moving the price into `venue_settings.hourly_rate` is the only way the server can own it, and it also ends the risk of the landing page and the checkout disagreeing. The screenshot goes sooner than the other fields (30 days after the staff decision) because it is only needed for the check and carries the most personal detail; an Edge Function deletes it because Supabase Storage only deletes through its API, and Supabase's own service role stays inside Supabase that way.

Turnstile over the alternatives: free, usually invisible, no tracking cookies (so the cookie notice needs no change, unlike reCAPTCHA), and it has an official Cloudflare agent skill now installed.

## Amendment 2026-10-02: the checkout card

### Context

The engineer walked the built checkout with stand in payment facts and found two problems. The look: the shared `--overlay` (80% black with a light blur) hides the board almost completely, and the side or bottom sheet does not match the card style they want, shown in five reference screenshots (a segmented progress bar, an icon header, a hold timer banner, grouped cards, and a receipt with a check badge). The wording: at the receipt a player who has just paid reads "Waiting for payment check", which feels uncertain at the exact moment they want reassurance. Staff still need to see the true state, because nobody has looked at the money yet. A further force is the Data Privacy Act: consent to process personal data is clearer as its own act than as part of a terms tick.

### Options considered

**The receipt's word.**

- **"Confirmed" to the player, rules reworded (chosen).** Pros: reassures a paying player; the promise is written into the rules they tick, so it is honest. Cons: the venue now owes a message and a refund whenever a payment fails the check, and the player hears "Confirmed" before anyone has looked.
- **"Confirmed" with the rules unchanged.** Pros: no copy change. Cons: the receipt contradicts the rule the player just agreed to, which is the kind of mismatch a dispute turns on.
- **"Received", restyled.** Pros: matches the database exactly. Cons: the engineer judged it too uncertain for a paid player.

**The shape.**

- **A centered card on every width (chosen).** Pros: one layout to build and test, the look the engineer asked for, the board stays visible around it. Cons: less room with a phone keyboard up, and further from the thumb than a bottom sheet.
- **Card from `md`, bottom sheet on a phone.** Pros: thumb reach, and keeps the sheet that already works. Cons: two layouts, and not the reference look.

**The overlay.** A checkout only `--overlay-soft` (chosen) over lightening `--overlay` for everyone, because the staff sheets sit over a dense grid where the darker dim keeps it out of the way.

**The consent.** Three boxes checked as three Zod literals (chosen) over one box, because a separate privacy consent is the clearer record under RA 10173 and the action, not just the page, refuses a missing one. No column records them separately: the three cannot be sent apart, and the terms version with its time already records the agreement.

### Rationale

The player and the staff member are looking at the same booking for different reasons: the player wants to know the court is theirs, and staff want to know whether the money arrived. Showing each the true answer to their own question is honest only if the rules say the venue stands behind the slot unless the payment fails, so the rule changes with the word, and the terms version is bumped so every booking records which promise it was made under. The card shape and the soft overlay are the engineer's design direction; the parts kept from the built sheet (the steps, the hold, focus on step change, the live region rules) are what made it work, so the amendment is a restyle around them, built thin thread first (the new shell around the old steps) so the hold and receipt keep working at every step of the change. Turnstile stays once because Confirm is already protected by three things a script cannot fake cheaply, and a second check would add a server change for no new protection.
