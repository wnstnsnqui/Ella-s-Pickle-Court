# 0013. Landing page with live court availability

**Date**: 2026-09-26 · updated 2026-09-29 (AC-6: the "Pick a date" calendar dropped in the redesign; the day strip pages a week at a time from `lg` up and scrolls through every bookable day below it)
**Status**: Accepted

## Summary

`/` becomes the venue's front door: a marketing page with a top bar, a hero, what the venue offers, a court booking section, where to find it, and a footer, in the look already built. The booking section and the hero's small board read the real schedule (both courts, real hours, real Booked cells) instead of made up data, and the public board itself now lives at `/schedule`, with old `/?date=` links redirected there. Booking online is not built yet: the button stays, and pressing it honestly says so and offers Messenger or a text instead. When the live read fails, the page never shows an error; it retries quietly, then falls back to a "message us to book" card and a short notice, and the failure goes to the logs.

## Requirements

**User stories**

- As a player, I want to see at a glance which hours are free on both courts for a day this week, so that I can plan a game before messaging the venue.
- As a player, I want to reach any day inside the booking window from the day strip, so that I can plan beyond the next seven days.
- As a player, I want an easy way to ask for the hours I picked, so that I don't have to retype them in a message.
- As a player on a bad connection, I want the page to still tell me how to book, so that a failed load never leaves me stuck.
- As Ella, I want the page to show our real courts, hours and prices, so that it never promises something the schedule contradicts.
- As Ella, I want to know how many people try to book online, so that I can decide when online booking is worth building.
- As a player with an old shared link, I want `/?date=…` to still open that day's board, so that the group chat link keeps working.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable)

- **AC-1**: `GET /` renders per request with no sign in, in this order: the top bar (wordmark, links to Offers, Book, Visit and Live schedule, and a "Book a court" button), the hero, the offers, the court booking section, the visit section, and the footer. The look is the landing page as built on 2026-09-26 (the design source), on `docs/design.md` tokens only, with every animation inside a reduced motion guard.
- **AC-2**: The page reads today once, through `getSchedule()` on the anonymous server client (the four granted columns), shared with `generateMetadata` through React `cache()`. No made up availability remains: `components/landing/mock-data.ts` and `isMockBooked` are gone.
- **AC-3**: The booking section's hours area shows one row per `grid.rows` entry whose `outOfHours` is false, labelled with `formatSlotLabel(row.label)`, and in each row one tile per court in `grid.courts` sort order, side by side under column headers carrying each court's name. The court chips are gone. A third court added in Settings shows as a third column with no code change.
- **AC-4**: Each tile is one of five views: **Free** (cell `available` and the row not yet ended), **Booked** (cell `booked`), **Closed** (cell `unavailable`), **Past** (the row ended before now on venue today) and **Selected**. Each view has its own state token colour, its own icon and an accessible name such as "Court 1 at 5pm. Free." Only Free and Selected tiles can be pressed; the rest are disabled. A legend lists the five views.
- **AC-5**: When `grid.closed` is true, the hours area shows a quiet "Closed on Sat 27 Sep" line in place of the tiles (never error wording), the day strip still works, and the booking button stays disabled.
- **AC-6**: The day strip offers every day from the venue's today (`grid.date`) through today plus `horizonDays`, the first labelled "Today", each showing its short weekday and date, with closed weekdays struck through as the board marks them. The heading above it names the chosen day ("Today, Tue 29 Sep" on today). There is no separate calendar. How the strip shows those days depends on the screen width:
  - From `lg` (1024 pixels) up, it shows `min(7, horizonDays + 1)` days at a time between a Previous week and a Next week button, which page by seven days and are disabled at either end. A highlight slides to the chosen day; when the chosen day is not on the week being shown, the highlight hides and the day stays chosen. The strip never pages itself to the chosen day's week; only the arrows move it.
  - Below `lg`, there are no arrows. All the days sit in one row that scrolls sideways (snapping to each day, no visible scrollbar) inside the strip, never scrolling the page itself sideways, and the chosen day wears the card background. The row starts at today and never scrolls itself, so a chosen day past the visible edge stays chosen until the player swipes to it.

  Changing the day clears the selection.
- **AC-7**: Picking another day fetches `GET /api/schedule?date=YYYY-MM-DD` in the browser; the page URL stays `/`. While it loads, the shown day's tiles stay on screen dimmed with `aria-busy`. Only the newest request may land; an older answer that arrives late is dropped.
- **AC-8**: A read that fails (network error, a non 2xx other than 429, or a body that is not an `ok` result) is retried in the browser up to 5 more times, waiting 1, 2, 4, 8 and 16 seconds between tries, with nothing on screen saying a retry is happening. On first load, a failed server read renders the page at once with the booking section's loading skeleton in place of the tiles, and the browser runs the same retries for today. A `429` stops the retries at once.
- **AC-9**: When the retries run out, or on a `429`, the hours area and summary are replaced by the **message card**: the heading "Book by message", a Messenger button, a Text us button, a "See the live schedule" link to `/schedule`, and a quiet "Try again" button. At the same moment one toast reads "We couldn't load the live schedule. Message us to book." The card itself carries no error wording. "Try again" runs one fresh read (with the AC-8 retries) of the day whose load failed (the day the player asked for, not the last day shown); success brings the picker back on that day, and failure keeps the card and shows the toast again.
- **AC-10**: Nowhere on the page is an error message, an error code, a status number, a stack or a digest shown. The only failure words a visitor ever sees are the AC-9 toast.
- **AC-11**: `/` joins `/schedule` and `/api/schedule` in the one rate limit window in `proxy.ts` (60 reads per rolling 60 seconds per address, counted together). Every `/` request is counted in that window, including one whose read is then skipped, so landing visits and board reads share one budget. Over the limit, `/` is never answered `429`: the proxy lets the request through with the request header `x-public-read-limited: 1`, attached to the forwarded request through `NextResponse.next({ request: { headers } })` (never as a response header, which the page cannot read), and always deletes any incoming header of that name first; the page skips `getSchedule()` entirely, renders the message card and shows the AC-9 toast, and omits the hero board. `/schedule` and `/api/schedule` keep their `429`.
- **AC-12**: A player can press Free tiles on any court, on one day, in any combination; pressing a Selected tile clears it. The summary card lists the day (`formatDayHeading`), the picked hours grouped by court in sort order ("Court 1: 5pm, 6pm"), and the total, which is the number of picked tiles times `slotMinutes / 60` times ₱250, shown as "₱1,000" with thousands commas and no decimals.
- **AC-13**: "Request booking" is disabled with nothing picked. Pressed, it writes nothing anywhere and keeps the selection, and shows a toast titled "Online booking is coming soon" with the description "Message us and we'll book it for you." and two buttons: **Messenger** (opens the venue's Messenger link) and **Text us** (opens an `sms:` link to the front desk number whose body is prefilled with the AC-12 grouping, courts in sort order separated by commas, for example "Hi! Can I book Court 1 at 5pm and 6pm, Court 2 at 7pm on Sat 27 Sep?"). The Visit section and the message card offer the same two channels and no others.
- **AC-14**: Pressing "Request booking" sends one cookieless `booking_intent` event with `{ slots, courts, days_ahead }` (picked tile count, distinct courts picked, days from venue today), added to the allow list in `lib/analytics/properties.ts` with a `.strict()` schema and sent through a `captureBookingIntent()` wrapper in `lib/analytics/browser.ts`. It does nothing when PostHog is unconfigured.
- **AC-15**: The hero board shows today's next up to 5 rows whose slot has not ended, using the same `!row.outOfHours` filter as AC-3 (one row per open hour, whatever each court's state), for every court, as Free or Booked tiles (Closed tiles show as Closed), with a caption "As of 3:12pm" from the server's `now` in venue time. When today has no row left (closed all day, or after closing), it shows tomorrow's first up to 5 rows under a "Closed now · Tomorrow" caption, from a second `getSchedule(tomorrow)` read made only in that case. The chip under it names the Free cell with the earliest `startsAt` after now across all courts, the court first in sort order winning a tie ("Court 2 is free at 5pm"), or says "Fully booked today"; on the tomorrow view it names tomorrow's first free hour. When the needed read is unavailable, or tomorrow is past the horizon or closed, the hero board and chip are omitted and the hero text simply fills the panel.
- **AC-16**: The hero stats are the number of courts (`grid.courts.length`, "Courts"), the earliest opening time in the week's `venue_hours` ("6am", "Earliest serve"), and "₱250" ("Per court hour"). The eyebrow reads "Now open in Minglanilla, Cebu". When every day in `venue_hours` is closed, the earliest serve stat is omitted. When the read is unavailable, the two data stats are omitted and only the price stays.
- **AC-17**: The offers section (anchor `#offers`, still labelled "Offers" in the top bar and footer) opens with the eyebrow "Why play here", the headline "Come for a game. Stay till the lights." and the lede "A whole court for your group at ₱250 an hour, with free wifi, free parking and comfort rooms right by the courts.", the price in it coming from `PRICE_PER_HOUR`. Below it sit two halves of equal height from 768 pixels wide, stacked on phones: the **Court rental** card (the dark mark coloured card, ₱250 per hour, its three perks as today, and no "Most popular" badge) and, beside it, a list of four quiet amenity tiles two across, in this order, each with a Phosphor icon, a name and one detail line: **Guest wifi** (`WifiHighIcon`, badge "Free", "Stay connected between games."), **Parking** (`CarIcon`, badge "Free", "On site, so you can park and play."), **Comfort rooms** (`ToiletIcon`, no badge, "Right next to the courts.") and **Outdoor courts** (`SunHorizonIcon`, badge "Night play", "Open air courts, lit for games after dark."). Badges use quiet tokens, never the mark colour, so the rental card stays where the eye lands first. Open play appears nowhere on the page.
- **AC-18**: The Visit section shows the address with the street as a marked placeholder and "Minglanilla, Cebu" real, a map sketch whose "Open in Maps" link searches "Minglanilla, Cebu", the opening hours from `schedule.hours` grouped Monday first, days sharing the same times merged ("Monday to Friday", "6am to 10pm"), closed days reading "Closed", and no holiday row. When the read is unavailable, the hours card reads "Message us for today's hours" instead. Contact offers Messenger and Text us only: no call link and no email.
- **AC-19**: Venue facts shared with other pages (address, locality, Messenger link, front desk number, hourly price) live once, in `lib/venue.ts`, and `lib/legal/constants.ts` reads `VENUE_ADDRESS` from there so the privacy page and the landing page never disagree. Landing copy, the rental card and the amenities live in `components/landing/content.ts`. Every value not confirmed real (street, phone, Messenger link) is a bracketed placeholder such as "[front desk mobile]". Confirmed real: Minglanilla, Cebu, ₱250 per court hour, and (confirmed 2026-09-26) free guest wifi, free parking on site, comfort rooms next to the courts, and open air courts lit for night play. The Visit section's parking note reads "Free parking on site." instead of a placeholder.
- **AC-20**: Metadata: `/` has the title "Ella's Picklecourt · Pickleball courts in Minglanilla, Cebu", a one sentence description, a canonical link to `/`, the existing generated social card, and is indexable. `/` embeds one JSON-LD `SportsActivityLocation` block (the existing `VenueJsonLd`, moved) with the name, URL, a `PostalAddress` (locality Minglanilla, region Cebu, country PH, street left out while it is a placeholder) and `openingHoursSpecification` from `schedule.hours`, omitted when the read is unavailable. `/schedule` no longer embeds it.
- **AC-21**: `GET /?date=YYYY-MM-DD` answers a permanent redirect (`308`) to `/schedule?date=YYYY-MM-DD`, keeping the value as is (the board validates it); `/` with no `date` is the landing page. Spec 0006 is updated to say the board lives at `/schedule`.
- **AC-22**: `app/sitemap.ts` lists `/`, `/schedule`, `/privacy` and `/terms` on `NEXT_PUBLIC_SITE_URL`; `app/robots.ts` allows those and disallows `/staff`, `/sign-in`, `/sign-up`, `/reset`, `/design` and `/api`, and points at the sitemap.
- **AC-23**: Failures are logged, never shown: a failed server read is reported by `getSchedule()`'s existing `reportFailure()` (PostHog error tracking and the Slack alert) plus one `console.error` line tagged `landing`; a browser read whose retries run out sends one `posthog.captureException` (which does nothing when PostHog is unconfigured) plus a `console.error`; an over limit render writes one `console.warn` server log line and sends nothing to PostHog.
- **AC-24**: No customer name, phone, note, payment status or amount is reachable from `/`: not in the HTML, not in any JSON it fetches. A test renders the page from a schedule fixture and asserts none of those keys or values appear.
- **AC-25**: Every day in the strip is a native radio (arrow keys move between days), every tile is a button at least 44 pixels tall with a visible focus ring, no view relies on colour alone, and with reduced motion the page arrives already in place with the day highlight jumping rather than sliding. Only the strip from `lg` up has a sliding highlight; the narrow strip swaps the chosen day's background with no motion to reduce.
- **AC-26**: The landing page lives in the route group `app/(landing)/` with its own `error.tsx`, so an unexpected crash anywhere in the page (not only a failed `getSchedule()`) never reaches the site wide error page. That boundary renders the top bar, the hero without its board, the message card and the AC-9 toast, reports the error with `posthog.captureException` and `console.error`, and shows no error text, code or digest. `app/error.tsx` keeps serving every other route.
- **AC-27**: Nothing in the offers section is clickable, so no card or tile moves on hover or press (the old hover lift is removed). The rental card and each amenity tile carry their own scroll reveal (`data-reveal`). The rental card uses the plain range (`entry 0% entry 55%`, no `--i`), and the tiles cascade in reading order after it: each tile sets its own `--i` (0 to 3, the pattern the hero's `data-rise` uses), and its range is `entry calc(var(--i) * 8%) entry calc(55% + var(--i) * 8%)`, an 8 percentage point step, so the last tile still finishes inside the entry phase. The rule sits inside the existing `@supports (animation-timeline: view())` block. Badges and icons never animate. With reduced motion, or in a browser without scroll timelines, the whole section is simply in place. The amenities are a `<ul>` labelled "Amenities", each name an `h3` holding only the name, each icon `aria-hidden`, and each badge a plain visible `<span>` placed after the `h3` in DOM order (it may sit top right visually), so a screen reader reads "Guest wifi" then "Free" with no screen reader only wiring.

## Decision

**Chosen option**: Option 2: A server rendered landing page on the live public read, with other days fetched in the browser from `GET /api/schedule`, and a quiet, retried fallback.

Today's schedule is read once on the server for the hero, the stats, the hours and the booking section; any other day comes from the existing public JSON endpoint; failure never shows an error and ends in a "message us to book" card after five quiet retries.

**Implementation skills**: `tailwind-4-docs` (`lombiq/tailwind-agent-skills`, `.agents/skills/tailwind-4-docs/`) · `instrument-error-tracking` (`posthog/skills`, `.agents/skills/instrument-error-tracking/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `playwright-cli` (`microsoft/playwright-cli`, `.agents/skills/playwright-cli/`) · `emil-design-eng`, `animate` and `apple-design` (`.claude/skills/`), for the motion already built

**Offers update (2026-09-26)**: open play is dropped. The section keeps the one priced offer, Court rental, and pairs it with four confirmed amenities as quiet tiles, so the price still has a home and the amenities read as what comes with it (AC-17, AC-19, AC-27). Reasoning: see [rationale.md](rationale.md), _Offers section update_.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no new tables, columns, or migrations. Every value comes from reads that already exist or from code constants:

| Source | Read by | What the page uses |
| --- | --- | --- |
| `court` (`id`, `name`, `sort_order`) | `getSchedule()`, anon | column headers, court count, tile names |
| `reservation` (the four granted columns only) | `getSchedule()`, anon | Booked cells, through `buildGrid` |
| `venue_settings` + `venue_hours` | `getSchedule()`, anon | `slotMinutes`, `bookingHorizonDays`, timezone, week hours |
| `lib/venue.ts` constants | server and client | address, locality, Messenger link, front desk number, `PRICE_PER_HOUR = 250` |
| `components/landing/content.ts` | server | hero copy, the offers heading, the rental card (`RENTAL`), the amenities (`AMENITIES`), visit blurb, parking note |

**State transitions** (the booking section, browser only):

`ready(day)` → pick another day → `loading(day, next)` → success → `ready(next)`
`loading` → failure → `retrying(attempt 1…5)` → success → `ready(next)` · all failed or a `429` → `message card`
`message card` → Try again → `loading` (same rules)
First load with a failed server read: `skeleton(today)` → `retrying` as above. Over limit render: straight to `message card`.
Selection lives only in `ready` and is cleared on any day change.

**API surface** (nothing new; one existing endpoint reused, one proxy change, one redirect):

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
| --- | --- | --- | --- | --- | --- |
| `/` | GET | `x-public-read-limited` request header, set only by `proxy.ts` | the landing page HTML | public | never an error status; over limit renders the message card |
| `/?date=…` | GET | `date` query | `308` to `/schedule?date=…` | public | none (the board validates the date) |
| `/api/schedule` | GET | `date: YYYY-MM-DD` (opt) | `ActionResult<Schedule>` | public | `422` bad date, `429` over limit, `500` read failed |
| `/sitemap.xml`, `/robots.txt` | GET | none | generated files | public | none |

**Value sourcing**:

| Action | Value produced / displayed | Source |
| --- | --- | --- |
| Booking section, today | courts, rows, cell states | `getSchedule()` → `grid.courts`, `grid.rows` |
| Booking section, other day | the same | `GET /api/schedule?date=` → `ActionResult<Schedule>` |
| Past tiles | now | `schedule.now` (server clock), ticked forward on the client once a minute, as the board does (spec 0006, AC-4) |
| Past tiles | venue today | `grid.date` of the today read |
| Day strip | days and labels | `grid.date`, `addDays`, `formatDayHeading`; every day through `grid.date` plus `schedule.horizonDays`, shown `min(7, horizonDays + 1)` at a time from `lg` up |
| Tile label | hour text | `formatSlotLabel(row.label)` |
| Total | amount | picked tiles × `grid.slotMinutes / 60` × `PRICE_PER_HOUR` (`lib/venue.ts`), whole pesos, comma grouped |
| Toast / Text us | SMS body | derived from the day heading and the picks grouped by court |
| Toast / Messenger | link | `VENUE_MESSENGER_URL` (`lib/venue.ts`, placeholder until Ella supplies it) |
| Text us | number | `VENUE_SMS_NUMBER` (`lib/venue.ts`, placeholder) |
| `booking_intent` | `slots`, `courts`, `days_ahead` | selection size, distinct court ids in it, `daysBetween(today, day)` |
| Hero board | next rows | today's `grid.rows` with `endsAt > now`, first 5; else `getSchedule(addDays(today, 1))` |
| Hero caption | "As of 3:12pm" | `schedule.now` formatted in `grid.timezone` with `formatAtVenue` |
| Hero stats | court count, earliest open | `grid.courts.length`; the minimum non null `open` across `schedule.hours.days` (a helper in `lib/schedule/`), formatted with `formatSlotLabel`; omitted when every day is closed |
| Hero chip | next free | the earliest `startsAt` Free cell after now across courts, sort order breaking a tie (a helper in `lib/schedule/`) |
| Offers heading | lede price | `formatPeso(PRICE_PER_HOUR)` (`lib/venue.ts`), never a typed "₱250" |
| Rental card | name, price, unit, blurb, perks | `RENTAL: Offer` in `components/landing/content.ts`, where `Offer` is `{ name; price; unit; blurb; perks: string[] }`; its price from `PRICE_PER_HOUR` |
| Amenity tiles | name, detail, badge | `AMENITIES` in `components/landing/content.ts`: `{ id: "wifi" \| "parking" \| "comfort-rooms" \| "outdoor"; name; detail; badge? }` in display order |
| Amenity tiles | icon | a `Record<Amenity["id"], Icon>` in `components/landing/offers.tsx`, from `@phosphor-icons/react/ssr`, so an amenity with no icon fails the typecheck |
| Visit | parking note | `VISIT_SECTION.parking` in `content.ts`, "Free parking on site." |
| Visit hours | grouped rows | `schedule.hours.days`, grouped with the same logic `VenueJsonLd` uses (spec 0007, AC-21) |
| JSON-LD | address, hours | `lib/venue.ts` locality; `schedule.hours` |
| Over limit | skip the read | `x-public-read-limited` request header, set by `proxy.ts` on the forwarded request via `NextResponse.next({ request: { headers } })` |
| Canonical, sitemap | site URL | `NEXT_PUBLIC_SITE_URL` (existing) |

**Key invariants**:

- The landing page never writes: no Server Action, no insert, no customer data collected.
- The page shows no error text; failure is visible only as the message card and the one AC-9 toast.
- The page never reads more than the four granted reservation columns, and never with anything but the anonymous client.
- Every price shown derives from the one `PRICE_PER_HOUR`; every venue fact from one constant in `lib/venue.ts`.
- Venue today and now always come from the server (`grid.date`, `schedule.now`), never the visitor's device clock.
- At most one browser read is in flight for the booking section; a newer pick supersedes it.

**Security model**: public and read only. Anyone may load `/` and `/api/schedule`; both go through the shared rate limit. The `x-public-read-limited` header is trusted only because `proxy.ts` deletes any incoming copy before it decides; forging it can only make a visitor skip their own read. No authentication, no roles, no personal data, so no compliance scope beyond spec 0010's privacy notice, which this page does not change. PostHog stays cookieless on `/`.

**Configuration required**: none new. `NEXT_PUBLIC_SITE_URL` and the PostHog keys already exist.

**Critical test scenarios**:

- Happy path: the landing page renders two court columns for today from a schedule fixture, a Free tile selects, the total reads ₱250 per hour picked, and "Request booking" shows the coming soon toast with an `sms:` body naming the picks, verifies **AC-3**, **AC-4**, **AC-12**, **AC-13**
- Day change: picking Tue in the strip fetches `/api/schedule?date=`, a slower older answer is dropped, and the selection clears, verifies **AC-6**, **AC-7**
- Failure: `/api/schedule` fails six times, the waits are 1, 2, 4, 8, 16 seconds (fake timers), then the message card and one toast appear and no error text is in the DOM; a `429` goes straight to the card, verifies **AC-8**, **AC-9**, **AC-10**
- Over limit: `proxy.ts` over the limit passes `/` with the header set and strips a forged one; the page with the header never calls `getSchedule()`, verifies **AC-11**
- Redirect: `/?date=2026-10-01` answers `308` to `/schedule?date=2026-10-01`, verifies **AC-21**
- Privacy: the rendered landing HTML carries none of the private reservation keys, verifies **AC-24**
- Crash: a component in the landing page throws during render, and the `(landing)` boundary shows the hero, the message card and the toast with no error text or digest, verifies **AC-26**
- Offers: the rendered offers section names Court rental at ₱250 and the four amenities in order, carries "Free" twice and "Night play" once, has no "Most popular" and no "Open play", each badge follows its tile's `h3` in the HTML, and no word in `RENTAL`, `AMENITIES` or the parking note is a placeholder; the lede's price follows `PRICE_PER_HOUR`, verifies **AC-17**, **AC-19**
- Offers motion: in a real browser the tiles reveal one after another on scroll, nothing moves on hover, and with reduced motion the section is in place on arrival, verifies **AC-27**
- Hero after closing: with `now` past the last row, the hero reads tomorrow and captions "Closed now · Tomorrow"; with tomorrow closed, the board is omitted, verifies **AC-15**

## Build plan

Tracer Bullet: the first task threads real data end to end through the page (server read, the side by side grid, the proxy and the redirect) before any of the richer behaviour is added.

1. **The thin thread.** `/` reads `getSchedule()` for today and passes the `Schedule` to the booking section; the section renders today's rows with one column per court and the five tile views, the court chips and `mock-data.ts` are removed, and prices come from `PRICE_PER_HOUR` in `lib/venue.ts`. Add the `/?date=` redirect in `next.config.ts` and move `/` into the proxy's shared window with the `x-public-read-limited` pass through, the page skipping its read when the header is set. Proven in a browser against a staff booking made on the staff board, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-11**, **AC-21**
2. **Other days.** The day strip on `grid.date` and `horizonDays` (the `DatePicker` first wired here was dropped in the redesign; see the 2026-09-29 AC-6 amendment), the browser fetch of `/api/schedule`, the dimmed loading state, the newest request guard, the minute clock for Past tiles, satisfies **AC-6**, **AC-7**
3. **Quiet failure.** The retry loop with its backoff and `429` stop, the first load skeleton path, the message card with Try again, the one toast, the AC-23 logging on both sides, and the landing page moved into `app/(landing)/` with its own quiet `error.tsx`, satisfies **AC-8**, **AC-9**, **AC-10**, **AC-23**, **AC-26**
4. **Selection and the honest button.** Picks across courts, the grouped summary and total, the coming soon toast with Messenger and Text us, the prefilled SMS body, and the `booking_intent` event through the allow list, satisfies **AC-12**, **AC-13**, **AC-14**
5. **Hero on real data.** The live hero board with its caption and chip, the tomorrow fallback read, and the data stats. "Next free cell" and "earliest opening time" are each one pure helper in `lib/schedule/` (tested once) so the hero, the chip and the stats never compute them differently, satisfies **AC-15**, **AC-16**
6. **Content and Visit.** `lib/venue.ts` gains the shared facts (new code: today it holds only the name, tagline and initial); `lib/legal/constants.ts` re exports `VENUE_ADDRESS` from it so its one importer, `app/privacy/page.tsx`, keeps working unchanged; `components/landing/content.ts` holds the copy and the offers (reshaped by task 9); the Visit section shows grouped real hours and the two channels, satisfies **AC-17**, **AC-18**, **AC-19**
7. **Discoverability.** The landing metadata, `VenueJsonLd` moved to `/` with the address, `app/sitemap.ts`, `app/robots.ts`, and spec 0006 updated for `/schedule`, satisfies **AC-20**, **AC-21**, **AC-22**
8. **Tests and the final pass.** `app/(landing)/page.test.ts` for the landing branches (live, read failed, over limit), unit tests for the retry schedule, the total, the SMS body and the hours grouping, the privacy assertion, and a keyboard and reduced motion pass in a real browser; `npm run check` green, satisfies **AC-1**, **AC-24**, **AC-25**
9. **Amenities in the offers section** (added 2026-09-26, one thin slice on top of the built page). In `content.ts`, replace `OFFERS` with `RENTAL` (no `featured`, no id union) and `AMENITIES`, rewrite `OFFERS_SECTION`, and set the parking note. In `offers.tsx`, lay out the two halves, drop the "Most popular" badge and the hover lift, add the amenity tiles with their icon map and badges, and give each tile its own `data-reveal` and `--i`; add the stepped reveal range beside the existing `[data-reveal]` rule in `app/globals.css`. Rewrite the AC-17 tests in `components/landing/content.test.ts` and the offers assertions in `app/(landing)/page.test.ts`, then check the cascade, the phone stack and reduced motion in a real browser, satisfies **AC-17**, **AC-19**, **AC-27**

## Consequences

**Positive**:

- The page can't disagree with the schedule: courts, hours and Booked cells are the same data the staff board writes.
- No new tables, secrets, vendors or write paths; the public database surface is unchanged.
- The `booking_intent` count gives Ella real demand data before anyone builds online booking.
- A player always leaves with a way to book, even when the database is down.

**Negative / tradeoffs**:

- `/` now costs a database read on every visit, where a static marketing page would cost none; the shared rate limit caps it, but a busy day spends more of the free quota.
- Five quiet retries mean a visitor on a dead connection waits about 31 seconds before seeing the message card; the skeleton is honest but slow.
- An over limit visitor gets a page that looks normal but has no live schedule, which could confuse someone refreshing repeatedly.
- The booking button promises nothing and books nothing, so for now it's a signpost to Messenger rather than a booking.
- Messenger and text only: someone who wants to call, or has neither app, has no path on this page.
- Prices and venue facts change only with a deploy.
- The amenity claims ("Free" wifi and parking, lit courts) are marketing promises in code: if one stops being true, the page is wrong until someone edits `content.ts` and deploys.
- With open play gone the section sells one thing, and without the "Most popular" badge or the hover lift the rental card is a little quieter than before; its dark colour is now the only emphasis.

**Neutral**:

- The landing page has no calendar (AC-6, amended 2026-09-29). A day near the end of the booking window takes a few presses of Next week on a wide screen, or a long swipe on a phone, where a calendar would take one tap. The boards at `/schedule` and `/staff` keep the spec 0011 calendar.
- The public board moves to `/schedule`; spec 0006's `/` wording, its AC-8 limiter paths and its AC-11 JSON-LD placement change with it.
- `lib/legal/constants.ts` now imports from `lib/venue.ts`.
- The staff board is untouched.

## Follow-up

- [ ] Ella supplies the real street address, front desk mobile number and Messenger link, and reads the marketing copy (including the new offers heading and amenity lines); each placeholder in `lib/venue.ts` and `components/landing/content.ts` is then replaced.
- [ ] Consider adding the four amenities to the JSON-LD as `amenityFeature` entries once `components/board/venue-json-ld.tsx` settles (it has uncommitted edits today), read from `AMENITIES` so the page and the search result never disagree. Left out of task 9 on purpose.
- [ ] If open play comes back later, it returns as its own card beside rental through a spec update, not as an amenity tile.
- [ ] Design real online booking (the request queue or instant booking discussed on 2026-09-26) as its own spec once `booking_intent` shows demand; it replaces AC-13's toast.
- [x] Update spec 0006 to name `/schedule` as the board's path (AC-1, AC-2, AC-8, AC-11), as part of build task 7. _Done 2026-09-26: spec 0006 updated, its task 11 tracks the code, and the board's loading skeleton moves to `app/schedule/loading.tsx` so it no longer shows on `/`._
- [ ] `emil-design-eng`, `animate` and `apple-design` shaped the page's motion but are not listed in root `AGENTS.md` `## Agent skills`; they belong there as project wide UI conventions.
- [ ] Consider scrolling the chosen day into view on the narrow day strip (AC-6), for a day reached by the arrow keys past the visible edge. Left out of the 2026-09-29 amendment on purpose: the strip starts at today and the player swipes.
- [x] Enroll a "Landing page" feature in `docs/scope/scope.md` linking this spec (feature 14, 2026-09-26).
