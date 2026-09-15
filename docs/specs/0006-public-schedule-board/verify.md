# Verify: Public schedule board · spec 0006 · updated 2026-09-15

_Steps derived from spec 0006 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones. Steps marked "(proven in the build)" were run on 2026-09-14 with a real browser and the Supabase CLI; run them again anyway._

## UI / manual

- [x] Open `/` in a browser with no session → the grid for every court with hours down the side, the legend (Available, Booked, Unavailable, Outside opening hours) visible without a tap, the day navigation in the toolbar, no sign in asked → AC-1
- [x] Open `/` → the day shown is today in `Asia/Manila` even on a device set to another zone (check the day heading against the venue's clock, not the device's) → AC-2 (source: `todayInZone(settings.timezone, now)`)
- [x] Open `/?date=<tomorrow>` → tomorrow's grid; `/?date=<yesterday>` → "That day could not be shown", "That day has passed", a Back to today link and no grid; `/?date=<horizon + 1>` → the notice with "only goes as far as"; `/?date=2026-13-40` → the notice with "Use a date like" → AC-2 (proven in the build)
- [x] On today's board during opening hours → a strip above the grid with one entry per court in sort order reading "Free now", "Free from <label>", or "Nothing free today"; the label matches the first Available row after now; on tomorrow's board no strip → AC-3 (source: `nextFreeTime(grid, court.id, now)`, label via `formatSlotLabel`)
- [x] With one court fully booked from now on and another free in the current slot → the first reads "Nothing free today", the second "Free now" → AC-3
- [x] On today's board during opening hours → rows that have ended are dimmed with no lock icon and still labelled, a "Now" line sits before the first row still to come, and the page opens with that line near the top under the sticky header; scroll away, wait for a change to land → the page does not scroll back → AC-4
- [x] On today's board with the device clock set wrong by a few hours → the marker and the strip still follow venue time (the server stamp), not the device → AC-4 (source: `schedule.now` ticked forward on the client)
- [x] On tomorrow's board → nothing dimmed, no marker → AC-4
- [x] Day navigation on today's board → the heading says "today" for the venue's today and the Today button is absent; on a dated board the Today button returns to the venue's today → AC-4 (source: `DayNav` `now` prop)
- [x] Open `/` in browser A (signed out) and `/staff` in browser B; book a free cell in B → within two seconds A shows it Booked with the changed highlight, no reload, and the live indicator reads Live → AC-5 (proven in the build with a CLI insert)
- [x] In B book six cells at once → A's network log shows one `GET /api/schedule` for the burst, not six → AC-5
- [x] In B make two changes 500 ms apart → A reads once, then once more about 2 seconds after the first → AC-5
- [x] Watch A's network log while idle and live → no `GET /api/schedule` polling → AC-6
- [x] Break the channel (turn off wifi briefly, or block `wss://` in devtools) → after 3 seconds the indicator reads Not live with the data age; a `GET /api/schedule` every 60 seconds; switch tabs away and back → one read at once; restore the channel → one read and the polling stops → AC-6
- [x] View source of `/` with a named booking on the day, and `GET /api/schedule` → no customer name, phone, note, payment status or amount anywhere → AC-7
- [x] In the browser console on `/`, subscribe to the `schedule` topic and trigger a change → the payload holds only court, start, end, kind and status → AC-7
- [x] With A live, force a `429` (61 curl requests from A's forwarded address inside a minute, or a temporary limit of 1 in `proxy.ts`) then trigger changes in B → A reads Not live, makes no read until `Retry-After` has passed, then exactly one read → AC-9
- [x] Two `429`s in a row with `Retry-After: 7` then `3` → the second wait is three seconds from the second response, not ten → AC-9
- [ ] Stop the endpoint (return 500) → A keeps the last good grid and shows the failed reload line; a first render that fails (bad database URL) → the error state with Retry → AC-9, AC-12
- [ ] Leave `/` (no date) open across the venue's midnight with nothing else happening → within a minute of midnight the board moves to the new day, the strip and marker follow, the heading says today; a tab on `/?date=<old day>` stays on that day and its heading says "past" → AC-10 (source: the minute tick comparing `calendarDateInZone(now, timezone)` with `grid.date`)
- [x] Share `/` and `/?date=<a day>` into a chat → the first unfurls as "Ella's Picklecourt · Court schedule" with the social card, the second as "Court schedule for <Sat 20 Sep> · Ella's Picklecourt" → AC-11
- [ ] Navigate between days with the arrows → the skeleton shows while the next day renders; with no courts → "No courts yet"; on a day with no open hours → "Closed all day" → AC-12
- [ ] Signed in as staff, open `/` → the staff link is in the header; signed out → it is absent → AC-12
- [ ] On `/staff` book, edit, cancel and close a court as before, watch the second browser update, and see the indicator move through reconnecting to not live and back → AC-13 (the staff board on the shared hook behaves as spec 0005 verified)
- [x] Open `/design` and press "Past hours dimmed, Now marker" → the dimmed rows and the marker read clearly in both themes → AC-4

## Commands

- [x] `curl -s -D - http://localhost:3000/api/schedule` → `200`, `Cache-Control: no-store`, body `{"ok":true,"data":{...}}` with `now`, `hours` and `grid`, and no personal key at any depth → AC-5, AC-7 (proven in the build)
- [x] `curl -s "http://localhost:3000/api/schedule?date=<yesterday>"` → `422` with `"kind":"invalid"`; same for `?date=<horizon + 1>` and `?date=2026-13-40` → AC-2 (proven in the build)
- [x] `for i in $(seq 1 61); do curl -s -o /dev/null -w "%{http_code}\n" -H "X-Forwarded-For: 203.0.113.9" http://localhost:3000/api/schedule; done | sort | uniq -c` → sixty `200` and one `429`; the `429` carries `Retry-After` and a JSON body; the same for `/` gives a `text/plain` body; a request from `203.0.113.10` and one with no forwarded header still `200` → AC-8 (proven in the build)
- [x] `curl -s -o /dev/null -w "%{http_code}\n" -H "X-Forwarded-For: 203.0.113.9" http://localhost:3000/api/health` 70 times → all `200` → AC-8
- [x] `curl -s http://localhost:3000/ | grep -o '<title>[^<]*'` → `Ella's Picklecourt · Court schedule`; with `?date=2026-09-20` → `Court schedule for Sun 20 Sep · Ella's Picklecourt`; both carry `rel="canonical" href="<site>/"`; the page holds one `application/ld+json` block of type `SportsActivityLocation` whose `opens` and `closes` match `venue_settings` for weekdays and the weekend → AC-11 (proven in the build)
- [x] Change the weekend closing time in `venue_settings` and reload `/` → the JSON-LD block reflects it with no code change → AC-11 (source: `schedule.hours`)
- [x] With the dev server logging queries, load `/?date=<a day>` once → one settings read and one grid read, not two of each, even though `generateMetadata` and the page both call `getSchedule` → AC-11 (source: React `cache()`)
- [x] `npm run check` → lint, format, typecheck and 292 tests green → AC-8, AC-13 and the pure logic behind AC-5, AC-9

## Acceptance-criteria coverage

- AC-1 grid, legend, day navigation, anonymous read · AC-2 day rules on the page and the endpoint · AC-3 the next free strip · AC-4 dimmed past rows, the marker, the scroll, the shared clock · AC-5 the live path, coalescing and the floor · AC-6 not live, focus refetch, slow poll · AC-7 no personal data in HTML, JSON or the broadcast · AC-8 the limiter and its bodies · AC-9 the read gate and the 429 wait · AC-10 midnight · AC-11 titles, canonical, JSON-LD, one read per request · AC-12 states and the staff link · AC-13 the staff board on the shared hook
