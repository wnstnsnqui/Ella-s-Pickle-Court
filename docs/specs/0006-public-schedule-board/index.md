# 0006. Public schedule board

**Date**: 2026-09-14
**Status**: Proposed

## Summary

This is the page a player opens before driving over: the same court grid the staff keep, at `/`, with no sign in, showing today through the booking horizon as Booked, Available or Unavailable, and updating itself within a second or two of a staff change. Almost everything it needs already exists (the anonymous read, the grid, the day navigation, the live indicator, the social card), so the work is one page, one small JSON endpoint the browser re reads the day from, a listener hook shared with the staff board, a rate limit (a cap on how many times one address may ask per minute) in `proxy.ts`, and a few conveniences for a phone: a next free line per court, the past hours dimmed, and the page opening at the current hour. No new tables, no new vendors, no new secrets.

## Requirements

**User stories**

- As a player, I want to see which courts are free today and this week from my phone, so that I do not drive over to a full venue.
- As a player, I want the board to be right when I look at it, so that a court that was just booked does not still read Available.
- As a player, I want to share a link to a day with my group, so that we can pick an hour together.
- As Ella, I want nothing about a customer to be readable from the public page, so that a booking is between the venue and that person.
- As Ella, I want one abusive visitor to be unable to burn through the venue's free database quota, so that the board stays up for everybody else.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable)

- **AC-1**: `GET /` renders, per request and with no sign in, the grid for every court for one day: hours down the side, a column per court, every cell reading Available, Booked or Unavailable (plus the spec 0003 out of hours row marking), with the legend for those views visible without a tap. The read is `getSchedule()` on the anonymous server client, naming only the four columns anon is granted. The day navigation from spec 0003 moves between days.
- **AC-2**: With no `?date=`, the page shows today in `Asia/Manila`, never the reader's device day. `?date=YYYY-MM-DD` shows that day when it is today or up to `booking_horizon_days` ahead. A date before today, beyond the horizon, or malformed renders the "That day could not be shown" notice with the reason and a link back to today; it never renders a grid. The same rule applies to the JSON endpoint, which answers `422`.
- **AC-3**: When the day shown is venue today, a compact strip above the grid lists every court in sort order with one of: "Free now", "Free from 3pm" (the venue local start of the first Available slot at or after now, formatted with `formatSlotLabel`), or "Nothing free today". The strip is absent on any other day. It is a list with text, readable by a screen reader, not colour alone.
- **AC-4**: On venue today, rows whose slot has ended are rendered dimmed (a row level treatment, keeping every cell's label and icon, no lock icon), a "Now" marker sits before the first row that has not ended, and on first paint the grid is scrolled so that row is near the top of the viewport (instantly, never animated, and never again after a refetch). On other days nothing is dimmed and no marker shows. The time used is the server's `now`, ticked forward on the client once a minute, so a device with a wrong clock cannot move the marker.
- **AC-5**: The board joins the private `schedule` broadcast topic through the anonymous browser client (no Clerk token, ever), re reads the whole day through `GET /api/schedule` on every broadcast rather than patching from the payload, coalesces broadcasts arriving within 300 ms into one read, and only lets the newest read land. A booking made on the staff board shows as Booked on an already open public board within two seconds with no reload, with the spec 0003 changed cell highlight and the live indicator reading live.
- **AC-6**: While the channel is not `SUBSCRIBED`, the live indicator reports it per spec 0003, the board re reads the day every 60 seconds, and it re reads once whenever the tab becomes visible again. When the channel returns to `SUBSCRIBED` the board re reads once and the polling stops.
- **AC-7**: No customer name, phone, note, payment status or amount is reachable from the page: not in the rendered HTML, not in `GET /api/schedule`, not in the broadcast payload. A test serialises a JSON response and asserts none of those keys appear at any depth; a test asserts the public read still names exactly the four granted columns.
- **AC-8**: `GET /` and `GET /api/schedule` are rate limited in `proxy.ts` to 60 requests per rolling 60 seconds per client address, counted together. Over the limit the response is `429` with a `Retry-After` header (seconds), a one line plain text body for the page and a JSON error body for the endpoint, before any Clerk or database work happens. The address is the first entry of `x-forwarded-for`, else `x-real-ip`; a request with neither header is not limited. The store is in memory in the one running container, bounded in size, and unit tested.
- **AC-9**: On a `429` from `GET /api/schedule`, the board shows the not live reading with the data age, waits at least `Retry-After` before any further read (broadcasts during the wait are folded into one read after it), and recovers on its own. On any other failed read the board keeps the last good grid and shows the not live reading; a failed first render shows the spec 0003 error state with Retry.
- **AC-10**: A board opened with no `?date=` follows the venue's day: when a re read (broadcast, poll or focus) returns a different `grid.date`, the board re keys to the new day, the strip and marker follow, and the day navigation reflects the new today. A board opened with a `?date=` stays on that date.
- **AC-11**: Metadata: `/` carries the venue title (`Ella's Picklecourt · Court schedule`), the tagline as description, the existing generated social card, and is indexable; `/?date=…` carries the day in its title (`Court schedule for Sat 20 Sep · Ella's Picklecourt`, venue local) and a canonical link to `/`. The page embeds one JSON-LD `SportsActivityLocation` block with the venue name, URL and an `openingHoursSpecification` derived from `venue_settings` at render time. Nothing personal and no reservation data goes in the block.
- **AC-12**: The board's other states use the spec 0003 components: a route level loading skeleton while a day renders, the "no courts" empty state, the "closed today" empty state when the day has no open hours, and the error state with Retry when the read fails. The staff link in the header keeps working for a signed in staff member and is absent for everyone else.
- **AC-13**: The channel logic lives once: a base hook owns the channel, the coalescing, the generation guard, the status and the focus refetch; the staff hook adds the Clerk token and its Server Action transport, the public hook adds the JSON transport and the slow poll. The staff board's behaviour is unchanged and its existing tests pass.

## Decision

**Chosen option**: Option 2: A server rendered page, a public JSON endpoint for re reads, one shared listener hook, and an in memory limiter in `proxy.ts`.

The public board is `app/page.tsx` rendering `getSchedule()` per request into the existing read only `ScheduleGrid`; the browser keeps it current by listening on the anonymous client and re reading the day from `GET /api/schedule`, through a base hook the staff board is moved onto; `proxy.ts` caps the two public reads at 60 per minute per address from an in memory sliding window.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `zod` (`pproenca/dot-skills`, `.agents/skills/zod/`) · `tailwind-4-docs` (`lombiq/tailwind-agent-skills`, `.agents/skills/tailwind-4-docs/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `accessibility` (installed, `.agents/skills/accessibility/`, for the strip, the marker and the dimmed rows)

The RECOMMEND items settled here, each with the pick and the runner up:

- **The `now` stamp travels on the schedule.** `Schedule` gains `now: string` (a UTC instant), set by both `getSchedule()` and `getStaffSchedule()`. The client starts its minute clock from that stamp and moves it forward by elapsed time. Runner up: a separate header or field on the route only, which leaves the first server render without a `now` and reopens the hydration mismatch the question was about.
- **Past is a row property, not a cell view.** `ScheduleGrid` takes an optional `now?: string`; rows with `endsAt <= now` get a `data-past` attribute and muted styling, and the marker is rendered before the first row not ended. `CELL_VIEWS` stays at seven (spec 0003, invariant 3). Runner up: a new `past` cell view, which would mean seven becomes eight for something that is about time, not about a court.
- **Past dates are refused in `getSchedule()` only.** `resolveDate` gains an `allowPast` flag; the public read passes `false`, the staff read keeps `true` so an owner can still look back. Runner up: a check in the page and the route separately, which is two places to forget.
- **The route validates with Zod and answers with the same `ActionResult` shape.** `GET /api/schedule?date=` parses `date` with `scheduleDateSchema`, calls `getSchedule()`, and returns `{ ok, data }` or `{ ok, error }` with `422` for `invalid`, `500` for `failed`, `Cache-Control: no-store`. Runner up: a bespoke JSON shape, which the hook would then have to translate into what the staff transport already returns.
- **The limiter is a sliding window of timestamps per key.** `lib/rate-limit.ts` exports a pure `SlidingWindow` (limit, window, a clock injected for tests) with `hit(key, now)` returning `{ allowed, retryAfterSeconds }`, pruning each key on hit, and a periodic sweep plus a cap of 10,000 keys with oldest first eviction so memory stays bounded. Runner up: a fixed window counter (fewer timestamps kept, but it lets 120 through at a window boundary).
- **The limiter runs before Clerk.** `proxy()` checks the limit first for the two public paths and returns `429` without invoking `clerkMiddleware`. Runner up: inside the Clerk handler, which spends Clerk's work on a request about to be refused.
- **The strip's "Free now" means the current slot is Available.** `nextFreeTime(grid, courtId, now)` already returns the first Available row ending after `now`; when that row has started, the strip says "Free now", otherwise "Free from" plus its label; `null` reads "Nothing free today". Runner up: a separate "closed today" wording when every slot is Unavailable, which needs a second derivation for a rare case; the grid itself shows it.
- **Scroll to now is a one shot effect keyed on the grid date.** It runs after mount when `grid.date` is venue today, uses `scrollIntoView({ block: "start" })` with no smooth behaviour, and never re runs on refetch. Runner up: a sticky "Jump to now" button, which is a second control for something the page can just do.
- **Loading is a route segment file.** `app/loading.tsx` renders the shell with the `GridSkeleton`, so day to day navigation shows the skeleton while the new day renders. Runner up: Suspense inside the page, which is the same thing with more wiring.
- **JSON-LD is rendered in the page from the settings the read already loaded.** A `<script type="application/ld+json">` built from `VENUE_NAME`, `NEXT_PUBLIC_SITE_URL` and the weekday and weekend open and close times. Runner up: a static block, which goes stale the day feature 8 changes the hours.
- **The 429 page body is plain text.** "Too many requests. Try again in N seconds." with `Content-Type: text/plain`. Runner up: the styled error state, which would render React for a request the limiter exists to keep cheap.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**

No schema change. The page reads what spec 0002 already grants `anon`:

| Table            | Columns read                                    | Grant and policy (spec 0002)                          |
| ---------------- | ----------------------------------------------- | ----------------------------------------------------- |
| `venue_settings` | the opening hours, slot length, horizon, version | anon `select`                                         |
| `court`          | `id`, `name`, `note`, `sort_order`              | anon `select`                                         |
| `reservation`    | `court_id`, `starts_at`, `ends_at`, `kind`      | column level anon `select`, policy `status = 'active'` |

The only type change is `Schedule` gaining `now: string`. `StaffSchedule` inherits it.

**State transitions**

The board has no persisted state. The listener's channel state is the Supabase channel status (`CLOSED` → `SUBSCRIBED` → `TIMED_OUT` | `CHANNEL_ERROR` | `CLOSED` → …), read by the live indicator per spec 0003. Polling is on exactly while the status is not `SUBSCRIBED`.

**API surface**

| Endpoint        | Method | Key inputs                                    | Key outputs                                                        | Auth            | Key errors                                                                                                          |
| --------------- | ------ | --------------------------------------------- | ------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `/`             | GET    | `date: YYYY-MM-DD` (opt, search param)        | the rendered board, title, canonical, social card, JSON-LD         | public          | notice for a past, far or malformed date; `429` plain text over the limit                                          |
| `/api/schedule` | GET    | `date: YYYY-MM-DD` (opt, search param)        | `{ ok: true, data: Schedule }` with `now`, `Cache-Control: no-store` | public          | `422 { ok: false, error: { kind: "invalid" } }`; `500 { kind: "failed" }`; `429` JSON with `Retry-After`           |
| `schedule` topic | realtime | none (anon, private channel, `setAuth()` with no token) | `reservation_changed` events, narrowed payload (spec 0002)   | anon by policy  | join refused or dropped → status not `SUBSCRIBED`, handled per AC-6                                                 |

**Value sourcing**

| Action                 | Value produced / displayed                       | Source                                                                                                                                              |
| ---------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| render `/`             | the day shown                                    | `?date=` search param, else `todayInZone(settings.timezone)` inside `getSchedule()` (spec 0002)                                                    |
| render `/`             | whether a date is allowed                        | `resolveDate` with `allowPast: false`, horizon from `venue_settings.booking_horizon_days`                                                           |
| render `/`             | courts, rows, cell states, out of hours rows     | `buildGrid()` from the three tables above (spec 0002, AC-5)                                                                                         |
| render `/`             | the court's caption note                         | `court.note` (a note about the court, never about a customer; spec 0002)                                                                            |
| render `/`             | `now`                                            | `new Date()` on the server inside `getSchedule()`, stamped on `Schedule`                                                                            |
| render `/`             | which rows are past, where the marker sits       | derived: `row.endsAt <= now` for past; the first row with `row.endsAt > now` carries the marker                                                     |
| render `/`             | the next free strip lines                        | derived: `nextFreeTime(grid, court.id, now)` per court in `sort_order`, label via `formatSlotLabel(row.label)`; shown only when `grid.date === todayInZone(grid.timezone)` |
| render `/`             | the title and canonical                          | `VENUE_NAME` (`lib/venue.ts`), the day from `grid.date` formatted in `grid.timezone`, `metadataBase` from `NEXT_PUBLIC_SITE_URL` (spec 0003)        |
| render `/`             | the JSON-LD opening hours                        | `venue_settings` weekday and weekend open and close (already loaded by `getSchedule()`; exposed on `Schedule` as `hours` or read from `grid.openTime`/`closeTime` plus the weekend pair, see Follow-up) |
| render `/`             | the staff link in the header                     | Clerk `<Show when="signed-in">` in `StaffMenu` (spec 0004), streamed so the board never waits on it                                                 |
| `GET /api/schedule`    | the schedule JSON                                | `getSchedule(date)` unchanged, serialised as the `ActionResult`                                                                                     |
| listener               | when to re read                                  | the `reservation_changed` broadcast (spec 0002 trigger), tab visibility, the 60 s poll while not live, and `Retry-After` after a `429`             |
| listener               | whether a re read may land                       | the generation counter from `useStaffSchedule`, moved into the base hook                                                                            |
| listener               | which cells changed (highlight)                  | `use-changed-cells.ts` from spec 0003, comparing the old and new grid                                                                               |
| listener               | the day to re read                               | `?date=` when the page was opened dated, else no date (the server resolves today), which is what lets the board follow midnight                     |
| client clock           | the ticking `now`                                | `schedule.now` plus `Date.now() - mountedAt`, recomputed once a minute and replaced by the fresh stamp on every re read                              |
| limiter                | the client key                                   | first `x-forwarded-for` entry, else `x-real-ip`, else none (not limited)                                                                            |
| limiter                | limit and window                                 | constants in `lib/rate-limit.ts`: 60 per 60,000 ms                                                                                                  |
| limiter                | `Retry-After`                                    | derived: seconds until the oldest timestamp in the window expires, rounded up, minimum 1                                                            |

**Key invariants**

1. The public board never holds a Clerk token. `browserSupabase()` and `publicSupabase()` are the only clients under `app/page.tsx`, `app/api/schedule/` and `components/board/`. `staffBrowserSupabase()` and `staffSupabase()` do not appear there.
2. The public read names its four `reservation` columns explicitly (spec 0002, invariant). `select("*")` on `reservation` is never written on a public path.
3. The broadcast payload is a nudge, never a source of truth. No cell is ever set from the payload; every change reaches the screen through a full day read.
4. Only the newest read lands. A stale response is dropped by the generation counter.
5. The grid is dimmed and marked by time only. Past is `row.endsAt <= now`; no cell state changes because of it.
6. `now` comes from the server. The client only ever adds elapsed time to a server stamp.
7. The limiter is per address, in memory, and never keys on anything a client can set other than the forwarded address the host's reverse proxy writes. It runs before Clerk and before any database work.
8. Every Server Action still starts with `requireStaff()`. This feature adds none; its public read is a Route Handler, and the staff hook's transport is unchanged.
9. `CELL_VIEWS` stays at seven. Past hours are a row treatment, not a cell view.

**Security model**

- Reading: anyone. Postgres enforces the shape: the `anon` column grant on `reservation` and the `status = 'active'` policy from spec 0002 mean a public read cannot name a personal column without the query failing. The route and the page add nothing to what `anon` may see.
- Realtime: `anon` may join the private `schedule` topic by the `realtime.messages` policy; the trigger's narrowed payload carries `court_id`, `starts_at`, `ends_at`, `kind`, `status` and nothing else (spec 0002).
- Writing: none from this feature. There is no Server Action and no write path; the two clients used here hold the anon key only.
- Abuse: the in memory limiter in `proxy.ts` caps `GET /` and `GET /api/schedule` per client address. Clerk's own limits cover the sign in pages. `/api/health` is deliberately not limited so an uptime monitor is never refused.
- What the limiter does not cover, said plainly: the anon key is public by design (it is in the page), so a determined client can read Supabase's REST endpoint directly, bypassing this app. The column grant means they still get nothing personal; the cost is only quota, which feature 11's alerts and Supabase's own project limits watch. This is the same exposure the staff board already has and is not new here.
- Personal data: none is handled. No compliance scope beyond what spec 0002 already set for the tables.

**Configuration required**

No new environment variables or credentials. `NEXT_PUBLIC_SITE_URL` (spec 0003) is reused for the canonical link and the JSON-LD `url`. The limiter's numbers are constants in code, not settings, until somebody needs to tune them without a deploy.

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements)

- Happy path: a visitor with no session opens `/` on a phone, sees today's grid with the legend and the strip, a staff member books 4pm to 5pm on court 1 from another browser, and the public cell reads Booked within two seconds with no reload and the live indicator reads live, verifies **AC-1**, **AC-3**, **AC-5**.
- Day range: `/?date=` for yesterday, for the horizon plus one, and for `2026-13-40` each render the notice with a link to today and no grid; the JSON endpoint answers `422` for the same three, verifies **AC-2**.
- Now: at 15:05 venue time on today's board, rows ending at or before 15:00 are dimmed, the marker sits before the 15:00 row, and that row is at the top after first paint; on tomorrow's board nothing is dimmed and no strip or marker shows, verifies **AC-3**, **AC-4**.
- Bursts and staleness: six broadcasts within 100 ms produce one `GET /api/schedule`; a slow first response arriving after a fast second one is dropped, verifies **AC-5**.
- Not live: with the channel forced to `CHANNEL_ERROR` the indicator moves to not live after three seconds, a read happens at 60 s and again on `visibilitychange`, and polling stops when the status returns to `SUBSCRIBED` after one final read, verifies **AC-6**.
- Data exposure: a serialised `GET /api/schedule` response contains no `customer_name`, `customerName`, `customer_phone`, `customerPhone`, `note` on a reservation, `payment_status`, `paymentStatus` or `amount` key at any depth; the public read's select string is exactly the four columns; the rendered HTML for a day with bookings contains no customer name, verifies **AC-7**.
- Rate limit: the 61st request from one forwarded address inside a minute is `429` with `Retry-After`, the 61st from a second address is `200`, a request with no address header is never limited, and the sweep keeps the key map under its cap, verifies **AC-8**.
- Backoff: a `429` with `Retry-After: 7` puts the board in not live, three broadcasts during those seven seconds produce one read after them, verifies **AC-9**.
- Midnight: a board opened without `?date=` whose next read returns tomorrow's `grid.date` re keys, the strip and marker follow, and a board opened with `?date=` for the old day stays on it, verifies **AC-10**.
- Metadata: `/` has the venue title, description, the social card, a canonical of `/` and the JSON-LD block with the settings' hours; `/?date=2026-09-20` has the day in its title and a canonical of `/`, verifies **AC-11**.
- States: no courts, a closed day and a failed read each render the matching spec 0003 state; navigating days shows the skeleton, verifies **AC-12**.
- Shared hook: every existing `use-staff-schedule` test passes unchanged after the move onto the base hook, verifies **AC-13**.

## Build plan

Tracer Bullet: the first task replaces the holding page with a real, thin, end to end board and proves it against a staff booking after a reload. Live comes next, because "current" is the value of this page. The privacy assertion follows immediately while the read path is fresh. The limiter lands before anything is shared, then the phone conveniences, then the metadata.

1. [ ] The thin thread: `getSchedule()` gains `now` on `Schedule` and `resolveDate` gains `allowPast` (public `false`, staff `true`); `app/page.tsx` becomes the board, `force-dynamic`, rendering `ScheduleGrid` read only with the four public legend views, `DayNav` in the toolbar, the "That day could not be shown" notice for a past, far or malformed date, and the spec 0003 empty and error states; `app/loading.tsx` with the skeleton; the holding copy goes. Prove it: a booking made on `/staff` shows Booked on `/` after a reload, in a browser with no session, satisfies **AC-1**, **AC-2**, **AC-12**.
2. [ ] The endpoint: `app/api/schedule/route.ts`, `GET` only, `date` parsed with `scheduleDateSchema`, `getSchedule()` behind it, the `ActionResult` shape with `422` and `500`, `Cache-Control: no-store`, and a route test, satisfies **AC-2**, **AC-5**.
3. [ ] The shared hook: extract `components/schedule/use-schedule-channel.ts` (channel on a given client, `setAuth()` step supplied by the caller, the generation guard, the 300 ms coalescing, the status, the visibility refetch, the listener set) from `use-staff-schedule.ts`; move the staff hook onto it with only the Clerk token step and the Server Action transport left in it; every existing staff test passes, satisfies **AC-13**.
4. [ ] Live: `components/board/use-public-schedule.ts` on the base hook with the anonymous client, a `setAuth()` with no token, the JSON transport hitting `/api/schedule` (dated or undated to match how the page was opened), and `components/board/public-board.tsx` rendering the grid, the changed cell highlight and the live indicator. Prove it: the booking from task 1 appears in a second, signed out browser with no reload, satisfies **AC-5**.
5. [ ] The privacy proof: the serialisation test over `GET /api/schedule`, the four column select assertion, and the rendered HTML check for a day with a named booking, satisfies **AC-7**.
6. [ ] Not live, backoff and midnight: the 60 s poll while not `SUBSCRIBED`, the single read on recovery, `429` handling with `Retry-After` in the transport and the fold of broadcasts into one read after it, the last good grid kept on any failure, and the re key on a changed `grid.date` for an undated board, satisfies **AC-6**, **AC-9**, **AC-10**.
7. [ ] The limiter: `lib/rate-limit.ts` (`SlidingWindow`, injected clock, prune, sweep, key cap) with unit tests; `proxy.ts` applies it to `GET /` and `GET /api/schedule` before Clerk, keyed on the forwarded address, skipping a request with no address, answering `429` with `Retry-After` and the plain text or JSON body; `proxy.test.ts` extended, satisfies **AC-8**.
8. [ ] Now on the grid: `now?: string` on `ScheduleGrid` (dimmed `data-past` rows, the marker with visible text before the first live row), the client minute clock started from `schedule.now` and reset by every re read, the one shot scroll to the marker on today, and `components/board/next-free-strip.tsx` from `nextFreeTime()` shown only on today; the design page gets the marker and a dimmed row in its gallery, satisfies **AC-3**, **AC-4**.
9. [ ] Metadata: `generateMetadata` on the page (venue title on `/`, the day in the title when dated, description, canonical `/`, `robots` index), and the JSON-LD `SportsActivityLocation` block from the settings' hours and `NEXT_PUBLIC_SITE_URL`; the existing social card is kept as is, satisfies **AC-11**.
10. [ ] `npm run check` clean, the two browser proof in `verify.md`, and the holding page's tests replaced by the board's, satisfies every AC above.

## Consequences

**Positive**

- The public page ships with almost no new surface: one page, one `GET` route, one pure limiter module, one shared hook. Every guarantee spec 0002 made (four columns, narrowed broadcast, active rows only) carries over with no new SQL.
- The board cannot lie for long: every broadcast, every focus, every poll tick and every recovery re reads the whole day, and only the newest answer lands.
- One listener implementation serves both boards, so the burst coalescing and the generation guard exist in one place and a fix lands on both.
- The rate limit is code in the repo with tests, not a setting on a host that has not been chosen yet.
- A shared dated link unfurls with the day in its title and lands on that day; the search engines see one page.

**Negative / tradeoffs**

- An in memory limiter resets on every deploy and covers one container only. If a second container is ever run behind the same host, each has its own count and the effective limit doubles. Acceptable at one container (spec 0001); a shared store is the change if that ever moves.
- The limiter keys on a header the host's reverse proxy must set. Until the host is picked (spec 0001 follow up), local and direct traffic is simply not limited, by design.
- The anon key is public, so this limiter guards the app's own read path, not Supabase's REST endpoint. Quota abuse through the key directly is a Supabase project limit and a feature 11 alert, not something this feature can stop. Nothing personal leaks either way.
- Supabase Realtime on the free tier allows a fixed number of concurrent connections shared by both boards. A crowd of open public tabs can reach it, at which point new tabs fall back to the 60 second poll and read not live. That is the graceful path, but it is a visible degradation on a busy day.
- Touching `use-staff-schedule.ts` to extract the base hook is a change to a feature marked done. Its tests are the safety net; the diff should be a move, not a rewrite.
- A row level "past" treatment and a `now` prop widen `ScheduleGrid` again. The staff board does not use them yet, so the two boards render today slightly differently until it does (Follow-up).

**Neutral**

- `Schedule` gains `now`. Every consumer already treats `Schedule` as a whole object, so the field is additive.
- The design gallery gains the marker and a dimmed row so both themes can be checked.
- `app/page.tsx` stops being a holding page; the copy about the board "not being open yet" goes with it.

## Follow-up

- [ ] When the host is picked (spec 0001 follow up), confirm its reverse proxy sets `x-forwarded-for` (or `x-real-ip`) and strips a client supplied one, then note in `proxy.ts` which header is trusted. Until then the limiter is effectively off for direct traffic.
- [ ] Feature 11 (analytics and error alerts) should count `429` responses and the not live state, and alert on the Supabase Realtime connection cap and the database quota, which is the exposure this limiter cannot close.
- [ ] Give the staff board the same `now` prop: dimmed past rows and the marker would replace its lock only dimming with the same look, and its lock icon would stay for the staff only rule (spec 0005, AC-11).
- [ ] The JSON-LD opening hours need the weekend pair as well as the weekday pair. `Grid` carries only the day's `openTime` and `closeTime`; expose the four settings values on `Schedule` (or a small `hours` object) in task 1 rather than re reading `venue_settings` in the page. Decide the shape in the build, either is fine; this is a naming choice, not a design one.
- [ ] Player self booking with payment (Deferred list) plugs into this page: the read only grid's `onSelectCell` seam is where a tap becomes a booking flow, and the strip's "Free now" is the obvious call to action. Nothing here should be built in a way that makes a cell untappable later.
- [ ] `/api/health` is unlimited on purpose. If it ever touches the database, revisit.
- [ ] `accessibility` is installed but not listed in root `AGENTS.md` `## Agent skills`; its conventions apply to every screen and belong at root level.
