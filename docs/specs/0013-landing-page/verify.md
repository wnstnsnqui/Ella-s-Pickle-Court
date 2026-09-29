# Verify: Landing page · spec 0013 · updated 2026-09-26 · last run 2026-09-29 (BLOCKED on a settings write, see the /check verify report)

_Steps derived from spec 0013 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] Open `/` signed out → top bar (wordmark, Offers, Book, Visit, Live schedule, "Book a court"), hero, offers, court booking, visit, footer, in that order → AC-1
- [x] Book a booking on `/staff` for today, reload `/` → that tile reads Booked on the right court and hour, in the booking section and in the hero board → AC-2, AC-3, AC-15
- [x] Add a third court in `/staff/settings`, reload `/` → a third column appears with no code change; retire it again after → AC-3
- [x] Hover or tab the tiles → each has an accessible name like "Court 1 at 5pm. Free."; Booked, Closed and Past tiles are disabled; the legend lists Free, Selected, Booked, Closed, Past → AC-4
- [x] Set today's weekday to closed in Settings, reload → a quiet "Closed on <day>" line in place of the tiles, the strip still works, Request booking stays disabled → AC-5
- [ ] At 1440 wide the strip shows `min(7, horizon + 1)` days from the venue's today, the first labelled Today, between Previous week (disabled) and Next week; press Next week and pick a day → the highlight slides to it and the heading names it; page back → the highlight hides while the chosen day is off the shown week; Next week is disabled on the last week; closed weekdays are struck through → AC-6
- [x] At 390 and 1023 wide there are no arrows; the strip scrolls sideways through every day to today plus the horizon, the page never scrolls sideways; pick the last day → it wears the card background and the heading names it → AC-6
- [x] Pick Tuesday → the URL stays `/`, the network shows `GET /api/schedule?date=YYYY-MM-DD`, tiles dim with `aria-busy` while it loads, picks clear → AC-6, AC-7
- [x] With the network throttled, tap two days quickly → only the last day's answer lands → AC-7
- [x] Block `/api/schedule` with a `500` (devtools request blocking), pick a day → about 31 seconds of dimmed tiles with no retry message, then the message card and one toast "We couldn't load the live schedule. Message us to book." → AC-8, AC-9, AC-10
- [x] With it still blocked, press Try again → it retries the day you asked for, not the last day shown, and ends in the card and toast again; unblock and Try again → the picker returns on that day → AC-9
- [x] Answer `/api/schedule` with `429` → the card and toast appear at once, no retries → AC-8, AC-9
- [x] Send 61 reads from one address inside a minute (mix `/`, `/schedule`, `/api/schedule`) → `/` still answers 200 with the message card and no hero board; `/schedule` answers 429 → AC-11
- [x] Send `/` with a forged `x-public-read-limited: 1` header while under the limit → the live page renders normally → AC-11
- [x] Pick Court 1 at two hours and Court 2 at one → the summary reads "Court 1: 5pm, 6pm" then "Court 2: 7pm", total ₱750; pressing a Selected tile clears it → AC-12
- [x] Press Request booking → nothing is written (the staff board is unchanged), picks stay, the toast "Online booking is coming soon" offers Messenger and Text us; Text us opens an `sms:` link whose body names every court and hour and the day → AC-13
- [x] With PostHog configured, press Request booking → one `booking_intent` event with only `slots`, `courts`, `days_ahead`, and no cookie set → AC-14
- [x] After closing time (or with today closed), load `/` → the hero reads "Closed now · Tomorrow" with tomorrow's first hours; with tomorrow also closed, the hero has no board and the text fills the panel → AC-15
- [x] Hero stats read the court count, the week's earliest opening as "Earliest serve", and ₱250 → AC-16
- [x] ~~Offers shows Court rental at ₱250 (featured) and Open play with bracketed placeholder price, blurb and perks → AC-17~~ Replaced by _Offers update (build task 9)_ below: open play is gone.
- [x] Visit shows "[street address]" and "Minglanilla, Cebu", "Open in Maps" searches Minglanilla, Cebu, the hours grouped Monday first with closed days reading Closed; contact is Messenger and Text us only, no call or email link anywhere on the page → AC-18
- [x] `/privacy` shows the same address line as the landing page → AC-19
- [x] Every animation settles with reduced motion on; the day highlight jumps rather than slides; tab through the strip with arrow keys and the tiles show a visible focus ring; each tile is at least 44 pixels tall → AC-1, AC-25
- [x] Throw inside a landing component (temporarily), load `/` → the landing boundary shows the top bar, the hero without its board, the message card and the toast, with no error text, code or digest; other routes still use `app/error.tsx` → AC-26

## Commands

- [x] `curl -sI "http://localhost:3000/?date=2026-10-01"` → `308` with `location: /schedule?date=2026-10-01` → AC-21
- [x] `curl -s http://localhost:3000/robots.txt` and `/sitemap.xml` → the four public pages allowed and listed; `/staff`, `/sign-in`, `/sign-up`, `/reset`, `/design`, `/api` disallowed → AC-22
- [x] `curl -s http://localhost:3000/ | grep -ciE 'customer|phone"|payment|amount'` → `0` → AC-24
- [x] `curl -s http://localhost:3000/ | grep -o '<title>[^<]*'` → "Ella's Picklecourt · Pickleball courts in Minglanilla, Cebu"; one `application/ld+json` block with `addressLocality` and no `streetAddress`; `/schedule` has none → AC-20
- [x] Force a server read failure (bad anon key in `.env.local` for one run) → the server log has one `landing:` error line, PostHog gets `reportFailure`, the page renders the skeleton then retries in the browser → AC-8, AC-23
- [x] `npm run check` → green → AC-24 and the unit tests

## Value sourcing

- [x] Venue today and Past tiles use the server's clock: set the device clock a day ahead, load `/` → the strip still starts at the venue's today and the Past tiles match Manila time → Value sourcing: now, venue today
- [x] "As of" is Manila time whatever the device timezone (set the browser to UTC) → Value sourcing: hero caption
- [x] Change the slot length to 30 minutes in Settings, pick two tiles → the total reads ₱250 (two half hours) → Value sourcing: total
- [x] Change a weekday's hours in Settings → the Visit card, the JSON-LD and the Earliest serve stat all change together on reload → Value sourcing: Visit hours, JSON-LD, hero stats
- [ ] Change the booking horizon to 3 days → the strip shows 4 days at every width, with both arrows disabled from `lg` up → Value sourcing: day strip
- [x] Change `PRICE_PER_HOUR` in `lib/venue.ts` → the hero stat, the offer card, the total and the summary note all follow → Value sourcing: total, invariant "every price from one constant"
- [x] `NEXT_PUBLIC_SITE_URL` set → the canonical, the JSON-LD url and the sitemap use it → Value sourcing: canonical, sitemap

## Offers update (build task 9)

- [x] Scroll to Offers → eyebrow "Why play here", headline "Come for a game. Stay till the lights.", and a lede naming ₱250 an hour, free wifi, free parking and comfort rooms → AC-17
- [x] Court rental is the dark card (₱250 per hour, three perks, no "Most popular") beside four tiles in this order: Guest wifi "Free", Parking "Free", Comfort rooms (no badge), Outdoor courts "Night play"; from 768 pixels wide the two halves are the same height → AC-17
- [x] Search the whole page for "open play" → no match anywhere → AC-17
- [x] Visit's parking line reads "Free parking on site." → AC-19
- [x] Hover the rental card and each tile → nothing moves and no shadow appears → AC-27
- [x] Scroll the section in from below → the rental card reveals, then the tiles one after another in reading order; badges and icons never animate on their own → AC-27
- [x] With reduced motion on (or in a browser without scroll timelines) → the section is already in place on arrival → AC-27
- [x] With a screen reader, the list is announced as "Amenities" and each tile reads its name, then its badge ("Guest wifi", "Free"), with no hidden text → AC-27
- [x] At 320 and 375 pixels → the halves stack, the tiles stay two across, each badge sits under its name without touching the icon, and the page never scrolls sideways → AC-17
- [x] Change `PRICE_PER_HOUR` in `lib/venue.ts` → the offers lede and the rental card both follow → Value sourcing: offers heading, rental card
- [x] Add a fifth id to `Amenity["id"]` without an icon → `npx tsc --noEmit` fails on the icon map in `offers.tsx` → Value sourcing: amenity icon

## Acceptance-criteria coverage

- AC-1 manual order and motion · AC-2 page test (one read), staff booking check · AC-3 page test, third court · AC-4 booking.test, accessible names · AC-5 page test, closed day · AC-6 strip at wide and narrow widths · AC-7 read-day.test (cancel), network check · AC-8 read-day.test (schedule of waits), 500 check · AC-9 card and Try again · AC-10 page tests (no error words), 500 check · AC-11 proxy.test, page test, 61 read check · AC-12 booking.test, summary check · AC-13 booking.test (SMS body), toast check · AC-14 properties.test, PostHog check · AC-15 hero-data.test, page test · AC-16 hours.test, page test · AC-17 content.test, page test, offers update checks · AC-18 hours.test, page test · AC-19 privacy check, content.test (no placeholders), parking check · AC-20 page test, venue-json-ld.test · AC-21 curl · AC-22 robots.test, curl · AC-23 page test, server failure check · AC-24 page test, curl · AC-25 keyboard and reduced motion check · AC-26 error.test, crash check · AC-27 page test (badge order, no hover), offers motion and screen reader checks
