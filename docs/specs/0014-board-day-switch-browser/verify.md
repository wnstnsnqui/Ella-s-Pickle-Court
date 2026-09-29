# Verify: board day switch · spec 0014 · updated 2026-09-26

_Steps derived from spec 0014 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] On `/schedule`, tap Next day with the network panel open → exactly one `GET /api/schedule?date=<tomorrow>`, no document request and no request with an `RSC` header, the realtime socket is not reopened → AC-1
- [x] On `/staff` (signed in), tap Next day → one `POST /staff` carrying a `Next-Action` header, no `RSC` GET, no new realtime socket → AC-1
- [x] Throttle the network (Slow 3G) and tap Next day → the heading jumps to tomorrow at once, only the Next arrow spins, Previous and the calendar are disabled, the grid is dimmed with `aria-busy="true"` and ignores clicks, the live indicator does not change → AC-2
- [x] Throttled, tap Next three times quickly while the first read is slowest → only the third day lands; the heading, grid and URL all name it → AC-3
- [x] Land tomorrow → the URL reads `?date=<tomorrow>` with any other parameters kept (try `/schedule?ref=x`), `history.length` is unchanged, Back leaves the board; reload shows tomorrow → AC-4
- [x] From tomorrow, tap Previous back to today → `date` is removed from the URL (`/schedule` or `/staff`) → AC-4, AC-9
- [x] Block `/api/schedule?date=<target>` with a `500` twice, then let it through → reads at about 0, 1 and 3 s, the grid stays dimmed meanwhile, then the day lands with no toast → AC-5
- [x] Block the target day with a `503` for good → four reads at about 0, 1, 3 and 7 s, then the heading snaps back, the grid undims, one toast "Couldn't load <day>." with Try again; `console.error` shows the failure; unblock and press Try again → the day lands → AC-5
- [x] Answer the target day with `429` and `Retry-After: 9` → one read, no retry, toast "Too many requests. Try again in 9 seconds.", snap back with no Try again; tap again inside the nine seconds → no request, the same toast with the seconds left → AC-6
- [x] Answer the target day with `422` and `reason: "out_of_range"` → no retry, toast "That day is past the booking window.", snap back → AC-6
- [x] On `/staff`, answer the day read with a `forbidden` kind (mock the action) → no retry, the action's message in a toast → AC-6
- [x] On `/staff`, select two free cells, tap Next → the selection is gone once tomorrow lands; open a sheet, change day → the sheet is closed → AC-7
- [ ] Book a cell on another device for tomorrow while this tab is on today, then tap Next → no cell is highlighted as changed on arrival → AC-7
- [x] On tomorrow, tap Previous to today → the grid scrolls to the now marker once; with PostHog configured, `board_day_viewed` is captured once per landed day and not on a re read of the same day → AC-7
- [x] Trigger a broadcast (book a cell elsewhere) while a throttled day read is pending → no `/api/schedule` read until the day lands, then exactly one read for the landed day → AC-8
- [x] Leave an undated `/schedule` open across venue midnight (or fake the clock) → it moves to the new day; a board on a dated day stays → AC-9
- [x] On `/schedule`, land tomorrow → the tab title reads `Court schedule for <Day D Mon> · Ella's Picklecourt`, and back on today it reads `Ella's Picklecourt · Court schedule`; on `/staff` the title stays `Staff schedule · Ella's Picklecourt` → AC-10
- [x] Reload `/schedule?date=<tomorrow>` and `/staff?date=<tomorrow>` → rendered on the server with the route skeleton, showing tomorrow → AC-11
- [x] On `/staff` showing the last bookable day, shrink the booking horizon in Settings so that day falls outside it → the toast "That day is no longer open for booking. Showing today." and today is read in the browser (one Server Action, no RSC request), with `date` removed from the URL. Restore the horizon afterwards → AC-11
- [x] On `/staff?date=<tomorrow>`, use the menu's Schedule link to `/staff` → today is shown (the fresh server render wins over the hook's day) → AC-11
- [x] On the landing page, block `/api/schedule` → five quiet retries at 1, 2, 4, 8 and 16 s, then the message card, as before → AC-12

## Value sourcing

- [x] Target day: Next from the heading day steps +1, a second Next during pending steps from the pending day, a calendar pick uses the picked day, bounded by the horizon → tap
- [x] Today (to decide undated): on a device whose clock or timezone is not Asia/Manila (e.g. `America/Los_Angeles`), navigate to venue today → `date` is removed; to the next venue day → `date` is kept → tap
- [x] Which control spins: tap Next → only Next spins; pick from the calendar → only the calendar spins; Try again on a day one step ahead → Next spins → pending
- [x] The heading during pending is the pending day, formatted as today → pending
- [x] The day's schedule comes from `GET /api/schedule` on `/schedule` and `refreshStaffSchedule` on `/staff`, and the staff board still shows customer names on the landed day → read
- [x] Whether to retry follows `TransportResult.retry`: network error and `5xx` retried, `4xx` and non `failed` action kinds not → read
- [x] Retry delays are 1, 2 and 4 s on the boards and unchanged on the landing page → read
- [x] Only the newest read lands (the racing step above) → read
- [x] `429` seconds come from `Retry-After`, and default to 5 s with no header → `429`
- [x] The URL keeps the current path and other parameters, sets `date` to the landed day, removes it on venue today → land
- [x] The public tab title matches what a reload of that address shows (compare `document.title` before and after reload) → land
- [x] The per day remount follows the landed `grid.date` (the selection and highlight steps above) → land
- [x] `board_day_viewed` carries the right days ahead for the landed day → land
- [x] The failure toast names the pending day, and Try again repeats that same day → failure
- [ ] The failure reaches `console.error` and, with PostHog configured, an exception in PostHog → failure
- [x] Midnight follow happens only when the board's day is undated → midnight

## Commands

- [x] `npm run check` → lint, format, typecheck and all tests pass → every AC
- [x] `npx vitest run lib/schedule/quiet-retry.test.ts components/landing/read-day.test.ts` → the shared helper's delays and the landing page's unchanged tests pass → AC-3, AC-5, AC-12
- [x] `npx vitest run components/schedule/read-gate.test.ts` → pause holds triggers, resume reads once, `markRead` counts for the floor → AC-8
- [x] `npx vitest run components/board/use-public-schedule.test.ts components/staff/staff-transport.test.ts` → `retry` set per transport as the Decision says → AC-5, AC-6
- [x] `npx vitest run lib/schedule/board-day.test.ts` → the title and the address helpers → AC-4, AC-10

## Acceptance-criteria coverage

- AC-1 · UI steps 1, 2 · AC-2 · step 3 · AC-3 · step 4 and the quiet retry test · AC-4 · steps 5, 6 and the address test · AC-5 · steps 7, 8 · AC-6 · steps 9, 10, 11 · AC-7 · steps 12, 13, 14 · AC-8 · step 15 and the gate tests · AC-9 · steps 6, 16 · AC-10 · step 17 · AC-11 · steps 18, 19, 20 · AC-12 · step 21 and the landing tests
