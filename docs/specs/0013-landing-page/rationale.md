# 0013. Landing page with live court availability: rationale

## Context

Until 2026-09-26, `/` was the public schedule board (spec 0006): the page a player opens before driving over. The venue now wants a front door at `/` that says what it is, what it sells, how to book, and where to find it, while the board stays one tap away. A first version of that page was built on invented data (six courts, fake prices, a hash that decided which hours were booked) before any design decision was recorded; this spec records the decision and turns the page real.

The forces at play:

- **Truth.** The venue has two courts and real opening hours in `venue_hours`. A marketing page that shows six courts, or an hour as free when staff booked it an hour ago, sends a player to the venue for nothing. That is the exact failure the board exists to prevent.
- **The read only public path.** Only staff can book. `publicSupabase()` is anonymous and read only by rule, and the public read is limited to four reservation columns (spec 0006, AC-7). Any real booking by a player means opening the first public write path, with spam, identity and privacy work attached.
- **Quota and abuse.** The public reads are capped per address in `proxy.ts` (spec 0006, AC-8) to protect the free database quota. A page that reads on every visit must share that cap.
- **No errors on the front door.** The engineer set a hard rule: the landing page never shows an error message. Failures must be logged, and a visitor must always leave with a way to book.
- **Existing links.** Players have shared `/?date=…` links to the board in group chats; moving the board must not break them.
- **Content.** Only two facts are confirmed: the venue is in Minglanilla, Cebu, and court time is ₱250 an hour. Everything else is copy Ella has not yet written.

## Options considered

### Option 1: A static marketing page with illustrative availability

Keep the booking section and the hero board as pictures, built from constants, with a clear link to `/schedule` for the real schedule. No database read on `/` at all; the page could even be statically rendered.

**Pros**:

- Zero database cost and no failure modes on the front door.
- Simplest to build and to reason about; the page is fast and cacheable.

**Cons**:

- The pictures can contradict reality (wrong court count, a "free" hour that is booked), which is the one thing this venue's software exists to avoid.
- The booking section becomes a mock that players will still try to use.

### Option 2: Server render today from the live read, fetch other days from `/api/schedule`, fail quietly (chosen)

`/` calls `getSchedule()` once on the server for today and uses it for the booking section, the hero board, the stats, the hours and the JSON-LD. Picking another day fetches the existing public endpoint in the browser. Failures retry quietly and end in a "message us to book" card.

**Pros**:

- Everything shown is the real schedule, through reads, types and limits that already exist and are already tested.
- No new endpoint, table, secret or write path.
- The URL stays `/`, so it never collides with the `/?date=` redirect.

**Cons**:

- A database read on every visit, and a failure path (retries, card, toast) to build and test.
- The retry budget makes the worst case slow (about 31 seconds before the fallback).

### Option 3: Embed the full live board, realtime included

Render the board's own grid on the landing page with the realtime listener (spec 0006, AC-5), so tiles flip as staff book.

**Pros**:

- Always current to the second, with no reload.
- Reuses the most existing code.

**Cons**:

- A realtime connection per landing visitor spends Supabase's realtime quota on people who are mostly reading marketing copy.
- The board's dense grid does not fit the booking section's selection model or look, and the page would grow the board's whole client bundle.

### Option 4: Server render every day, driven by a URL parameter

Picking a day navigates to `/?day=YYYY-MM-DD`, and the server renders that day.

**Pros**:

- A day on the landing page becomes shareable, and there is no client fetch code.

**Cons**:

- A full page render for every day tap, which is slow on a phone and redraws the whole page for one section.
- A second date parameter on `/` beside the one that must redirect to the board, which is confusing for people and search engines alike.

## Rationale

Option 2 is the only one that keeps the page honest without adding infrastructure. The venue's whole product is "the schedule is right", so Option 1's pictures fail the truth force from Context the day a staff member books an hour the hero shows as free. Option 3 buys second by second freshness the landing page does not need (a player about to message the venue can refresh) at the price of a realtime connection per visitor. Option 4 fights the redirect the engineer chose for old board links. Option 2 reuses `getSchedule()`, `GET /api/schedule`, `pickerBounds`, `formatSlotLabel` and the rate limit exactly as the board uses them, so the new code is the page and its failure handling, nothing underneath.

The failure design follows the engineer's rule that the front door never shows an error. Retries run in the browser rather than the server so a bad database moment never holds the whole page, and a `429` stops them because more tries only extend the limit. The over limit case was the hardest: the limiter used to answer `/` with a plain text `429`, which is an error page. Letting the request through with a header the proxy controls keeps the quota protected (the read is skipped) while the visitor still gets the page and a way to book. The header is deleted on the way in, so forging it can only cost the forger their own live schedule.

The booking button stays but books nothing, at the engineer's direction; online booking is deferred to its own spec. Rather than a fake "request sent" message, the button says plainly that online booking is coming and hands the picks to Messenger or a prefilled text, and the `booking_intent` event measures how many people want it. Contact facts moved into `lib/venue.ts` so the privacy page (spec 0010) and the landing page read one address; the landing only copy lives beside the landing components, where only this page uses it.

## Offers section update

_Added 2026-09-26. Covers AC-17, AC-19 and AC-27 as rewritten that day._

### Context

The venue does not run open play, so the section's second card (placeholder price, blurb and perks) and its heading ("Book a court, or just show up.") promised something that does not exist. The engineer wants the section to show four real amenities instead: guest wifi, parking, comfort rooms and outdoor courts, plus some marketing copy. The facts were confirmed the same day: wifi and parking are free, parking is on site, the comfort rooms are next to the courts, and the bookable courts are open air and lit for night play. Nothing in the section is interactive; it is read, not used.

### Options considered

**Option A: Keep Court rental, amenities beside it as a 2 by 2 grid (chosen).** The one priced offer stays as the dark card and the four amenities fill the other half as quiet tiles. Pros: the ₱250 price keeps a card that explains it; amenities read as what comes with a booking; the two column shape the section already has survives, so the change is small. Cons: the right half is four small tiles against one tall card, so tile copy must stay to one short line or the halves stop matching in height.

**Option B: Amenities only, drop the rental card.** Pros: the simplest section, all four amenities equal. Cons: the only place that says what a booking is and costs disappears from the section named "Offers"; the price survives only as a hero stat and a booking total.

**Option C: Rental as a wide banner, one row of four amenities below.** Pros: strong emphasis on price; amenities in one scannable row on desktop. Cons: a taller section, and the banner layout is new code rather than a reshaped existing card.

### Rationale

Option A, at the engineer's pick, because it removes the false promise (open play) without removing the true one (what a court costs), and it reuses the card that is already built. The copy direction ("Come for a game. Stay till the lights.") leans on night play, the one amenity most nearby venues can't claim, and the lede pulls the price from `PRICE_PER_HOUR` so it can never disagree with the booking total.

Design calls made while writing, each with its runner up:

- **The "Most popular" badge goes.** With one priced offer there is nothing to be more popular than, so the label would be untrue. The dark mark colour already makes the card the first thing the eye lands on. Runner up: rename it "Book by the hour", rejected as a label that repeats the price line.
- **The hover lift goes.** Nothing in the section is clickable, and a card that rises under the pointer promises a click that does nothing (a false affordance, per the `emil-design-eng` and `animate` purpose gate: motion needs a purpose, and "it looks nice" on something people pass often is not one). Runner up: keep it gated behind `(hover: hover) and (pointer: fine)`, rejected because the gate fixes touch screens but not the false promise.
- **The tiles cascade on scroll, using the reveal the page already has.** The scroll driven CSS reveal runs off the main thread and needs no script (the `animate` rule: cheapest tool that works). Scroll timelines have no clock, so a time delay does nothing; instead each tile's reveal range is shifted later by a step per `--i`, which reads as a short stagger in reading order. Each tile sets its own `--i`, the same pattern as the hero's `data-rise`, never a variable on the parent. Runner up: one reveal for the whole grid, rejected because four tiles landing at once read as a block rather than a list.
- **Badges and icons stay still.** A badge is information, not decoration; restraint (`apple-design`) keeps the section's motion to one idea, the entrance.
- **Badge wording is "Free", "Free" and "Night play".** The engineer's pick suggested "Open late", but closing times come from `venue_hours` and change by day, so "Open late" could contradict the Visit hours on an early closing day. "Night play" follows from the confirmed fact (the courts are lit). Comfort rooms get no badge, because a badge on every tile stops meaning anything.
- **Icons**: `WifiHighIcon`, `CarIcon` (the same icon the Visit section already uses for parking), `ToiletIcon`, and `SunHorizonIcon` for open air courts into the evening. The moon was avoided on purpose, because on the schedule grid it means out of hours. Runner up for outdoor courts: `LightbulbIcon`, rejected because it reads as "idea" before "lights".
- **The name is "Outdoor courts", plural**, because the engineer confirmed the bookable courts themselves are open air, not one special court.
- **The nav label stays "Offers"** and the anchor stays `#offers`, at the engineer's pick: still accurate for rental plus what comes with it, and no link or test wording changes.
- **JSON-LD `amenityFeature` is left for later.** It would be a cheap search result win, but `venue-json-ld.tsx` has uncommitted edits in the working tree today; it is a Follow-up rather than part of task 9.
