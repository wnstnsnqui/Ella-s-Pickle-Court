# 0017. Booking receipt and lookup: rationale

## Context

Online booking (spec 0015) ends on a receipt with a booking code, and the venue tells players "your code is how you find your booking". Today nothing finds it. Once the checkout card closes, a player has only what they saved, and the status they saw is frozen at the moment they confirmed. Staff decisions (spec 0016) then change that status (a payment turned down, a booking cancelled, a refund owed or paid), and the only way a player learns of it is a text from a manager. There are no player accounts, and the deferred email confirmation waits on a sending service the project does not have.

The code is the whole credential. It is 8 characters from a 31 character alphabet, drawn in Postgres, so it is hard to guess, but it is also easy to share: a booker forwards it to the group chat so everyone knows the court is booked. Whatever the code reveals, it reveals to everyone in that chat. The booking carries a name, a Philippine mobile number, an email, and the last 4 digits of a bank reference, all covered by the Data Privacy Act of 2012 and by the retention promises on `/privacy`.

Any public read that answers "does this code exist?" is a guessing oracle unless it is rate limited, and the project's existing public rate limiter lives in memory per server instance, which on Vercel resets whenever a new instance starts. The project's rules also forbid the public client from writing, keep `SUPABASE_JWT_SECRET` in one module, and make Postgres, not an `if` in a Server Action, the enforcement point.

Scope row 18 also asks for a download that "reads well printed or on a phone". Save as image already ships from checkout; an image prints poorly on paper.

## Options considered

### Option 1: An anon callable lookup function, limited in the proxy

A `security definer` function granted to `anon`, called from the browser or a Server Action through `publicSupabase()`, returning the masked view. `/booking` joins the proxy's in memory sliding window.

**Pros**

- The fewest moving parts: no role, no minter, no table.
- The read path the public board already uses.

**Cons**

- The limit is per instance and resets on a cold start, so a patient guesser spreads across instances.
- Anyone can call the function directly with the anon key, skipping whatever the action adds.
- Counting misses in Postgres would need the caller's identity, which an anon caller can fake.

### Option 2: A server gated read through a dedicated `booking_lookup` role, misses counted in Postgres (chosen)

A public Server Action hashes the connection, mints a 60 second token for a role that can run one function, and the function takes the limit, the lookup and the masking in one transaction. A small `booking_lookup_miss` table holds one row per wrong code for a day.

**Pros**

- The limit is durable and shared by every instance, and survives the planned Docker move.
- The client hash comes from the server's own token, so a caller cannot fake it.
- Full contact details never leave Postgres on this path.
- The same pattern as the hold (spec 0015), so nothing new to learn.

**Cons**

- A new role, a third minted token shape, and one more table to purge.
- Every lookup costs a token mint and a round trip through PostgREST.

### Option 3: A signed link per booking

The receipt carries a link with a signed token (`/booking/<signed id>`) that opens the booking without typing the code; the code alone stays a desk reference.

**Pros**

- Nothing to type; a bookmark works.
- No guessing oracle at all, since the signature cannot be forged.

**Cons**

- The token sits in URLs, browser history, Vercel logs and referrers, which the engineer ruled out.
- The rules, the refund message and the staff sheet all tell players to use the code; a second credential confuses that.
- Losing the link means losing access, and there is no email to resend it.

## Rationale

Option 2 is chosen because the force that matters most is guessing, and only a limit that every instance shares and no caller can fake actually holds. The project already solved exactly this for the hold: a server minted token carrying a client hash, a count in Postgres. Reusing that shape costs one role and one table, and buys a limit that holds on Vercel today and in a Docker container later. Option 1's in memory limit would be a limit in name only, and its function would be callable by anyone with the public key.

The engineer chose a separate `booking_lookup` role over reusing `online_booking`, so a lookup token can never hold slots or write a proof; that keeps each token worth exactly one thing. Masking happens in SQL because the shared code is the realistic exposure, and the safest place to drop the full phone and email is before they leave the database.

The engineer chose "Confirmed" for both checked and unchecked bookings, over the scope's "waiting for check". That keeps the promise the checkout receipt already makes under the 2026-10-02 rule ("confirmed when you finish checkout, staff check afterwards"), at the cost of the lookup never warning a player whose payment is still unchecked. The rule itself carries the safety net: staff message before cancelling.

Save as PDF through the browser's print dialog is chosen over a PDF library because the receipt is already HTML with real text, a print stylesheet costs no dependency, and a generated PDF would be a third layout to keep in step with the screen and the image. The single `ReceiptView` model is what keeps those surfaces honest.

Option 3 is the better answer to "nothing to type", but it fails the engineer's rule that the code stays out of URLs, and it adds a second credential to a product that has taught players one. The fragment handoff (`/booking#CODE`, never sent to the server, cleared on load) gives the receipt's "Track this booking" one tap without that cost.

Turnstile was left off the lookup: it writes nothing a bot profits from, and the code space plus the miss limit already make guessing pointless. The runner up, Turnstile only after the limit trips, is the planned response if the `not_found` count ever spikes.
