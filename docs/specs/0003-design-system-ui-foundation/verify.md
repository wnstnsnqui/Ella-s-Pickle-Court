# Verify: design system & UI foundation · spec 0003 · updated 2026-09-09

_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

_Run `npm run dev` and open `/design` unless a step says otherwise. It renders every token, component and cell state, so most of this is checkable on that one page._

## UI / manual

- [x] Open `/design` signed out, in a private window → the whole page renders, nothing asks you to sign in → AC-3
- [x] View source on `/design` → `<meta name="robots" content="noindex, nofollow">` is present → AC-3
- [x] Read the Contrast, measured table at the top of `/design` → the badge says every pair meets WCAG AA, and no row reads FAIL, in both the light and the dark half → AC-4
- [x] Switch your device between light and dark appearance and reload `/design` → the page follows it, with no toggle anywhere and no flash of the wrong theme on first paint → AC-1
- [x] In the Colour, Type and Space sections, compare the light pane against the dark pane → every token appears in both, and no component shows a colour that is not one of them → AC-1
- [x] In The cell states, cover the colour (browser devtools, Rendering, Emulate vision deficiency, Achromatopsia) → all seven views are still told apart, by icon and by name → AC-5
- [x] Tab to a cell in The cell states and inspect it with a screen reader or the accessibility tree → it announces the court, the time, and the state, for example "Court 1 at 9am. Booked." → AC-5
- [x] Look at the legend above the grid → all its icons and words are visible without tapping anything, and it sits in one row → AC-6
- [x] Set the viewport to 375 by 667 → the grid scrolls sideways with the time column pinned, and at least seven whole slot rows are visible below the header, the day navigation and the legend → AC-7
- [x] At that size, drag the grid sideways → the time column stays put and the court columns move under it → AC-7
- [x] Zoom the browser to 200 percent → nothing overlaps and nothing is cut off; wide content scrolls rather than disappearing → AC-7
- [x] Press Tab repeatedly from the top of `/design` → the whole grid takes exactly one stop, not one per cell → AC-8
- [x] With a cell focused, press the arrow keys, Home, End, Page Up and Page Down → focus moves as described, always shows a visible ring, and the ring is never clipped by the pinned time column → AC-8
- [x] Read the time column → `6am`, `12nn`, `1pm`, and a half hour slot reads `4:30pm`. The column never changes width as you scroll → AC-9
- [x] Look at the header of `/design` → the venue wordmark, the day navigation and the live indicator are all in the one shell → AC-10
- [x] Sign out (or run with no Clerk keys) and reload → no staff control appears anywhere in the page source, not merely hidden with CSS → AC-10
- [x] Turn on Reduce Motion in your system settings and reload → nothing animates, and a changed cell still carries a visible mark → AC-11
- [x] In The live indicator, press Channel dropped → it reads reconnecting; wait three seconds → it reads not live with the age of the data → AC-12
- [x] Press Channel dropped then Channel subscribed inside three seconds → it never says not live → AC-12
- [x] While it says not live, read the grid → it is still fully readable, and the indicator returns to live by itself when the channel comes back → AC-12
- [x] In The grid, press each of ready, loading, no-courts, closed and error → a skeleton, two different empty states, and an error with a working retry → AC-13
- [x] In The base components, exercise each one: button, input, select, sheet, dialog, toast, skeleton, badge, separator, alert, empty → each works and looks like the same system → AC-14
- [x] Open a dialog and a sheet → focus moves inside, Escape closes it, and focus returns to the trigger → AC-14
- [x] On the Network tab, reload `/design` → every font request is to our own origin, none to a font host → AC-15
- [x] Search the repo for Geist → no reference remains → AC-15
- [x] Open `/icon` and `/opengraph-image` → both return a generated PNG, and no image file exists in the repo for either → AC-16
- [x] Read `docs/design.md` → it covers type, colour, spacing, the state vocabulary, the component inventory and the accessibility rules, and names `app/globals.css` as the source of truth → AC-2

## Value sourcing

_One per row of the spec's Value sourcing table: change the input, check the output moves with it._

_Most of these need a board reading real data, which features 6 and 7 own. `/check verify` on 2026-09-09 left them unticked as blocked, not failed: there is no page yet that renders a real day from the database. Come back to them when the public board lands._

- [ ] Time column: change `slot_minutes` to 30 in the venue settings → labels gain their minutes (`6:30am`) and stay in venue time, not yours → AC-9
- [ ] Cell state: book an hour, then close a court over the same hour → the cell reads Unavailable, because closed beats booked → AC-5
- [ ] Out of hours: shorten the opening hours under an existing booking → that booking gets its own row, marked Outside opening hours, rather than vanishing → AC-5
- [x] Accessible name: read a cell with a screen reader → the name comes from the view map in this spec, never from a database column → AC-5
- [ ] Court header: rename a court and change its `sort_order` → the column heading and the column order both follow → AC-7
- [ ] Selected day: load `?date=2026-12-25` → that day renders on the server, first paint, with no client fetch. Load `?date=banana` → today at the venue, not an error → AC-10
- [ ] Booking horizon: set `booking_horizon_days` to 3 → the next day button is disabled on the third day ahead and says why → AC-10
- [ ] Changed cells: with two browsers on the same day, change a cell in one → only that cell highlights in the other, and only for its hold, and nothing highlights on a first load → AC-11
- [ ] Live indicator reading: kill the network in devtools → reconnecting, then not live. Restore it → live, by itself → AC-12
- [ ] Live indicator age: leave it not live for a minute → the age counts up from the last good render, and is never read from the database → AC-12
- [x] Venue name: change `VENUE_NAME` in `lib/venue.ts` → the wordmark, the page title and the social card all follow, because there is one constant → AC-16
- [ ] Staff controls: sign in, then sign out → the staff slot appears and disappears, and the page source carries nothing when signed out → AC-10
- [ ] Saving and failed: with the boards built, start a booking and watch the cell → it reads Saving while the action is in flight and Change refused if it is rejected, and neither is ever persisted → AC-5

## Commands

- [x] `npm run check` → lint, format, typecheck and tests all pass → AC-1
- [x] `npx eslint` on a file containing `bg-blue-500` or `dark:bg-card` → both are reported as errors → AC-1
- [x] `npm run build` → builds clean, `/design` is listed as server rendered on demand, and `/icon` and `/opengraph-image` are generated → AC-3, AC-16
- [x] `npx vitest run lib/time.test.ts` → the `formatSlotLabel` cases for noon, midnight and a half hour slot pass → AC-9

## Acceptance-criteria coverage

- AC-1 tokens and themes · covered by the theme, token and lint steps
- AC-2 `docs/design.md` · covered by the last UI step
- AC-3 the `/design` route · covered by the signed out, robots and build steps
- AC-4 contrast at AA · covered by the Contrast, measured table
- AC-5 the seven views · covered by the greyscale, screen reader and three state sourcing steps
- AC-6 the legend · covered by the legend step
- AC-7 the phone grid · covered by the 375 by 667, sideways scroll, zoom and court header steps
- AC-8 keyboard · covered by the one tab stop and arrow key steps
- AC-9 slot labels · covered by the time column, slot length and vitest steps
- AC-10 the shell · covered by the wordmark, signed out, date parameter and horizon steps
- AC-11 the changed cell highlight · covered by the reduced motion and two browser steps
- AC-12 the live indicator · covered by the four indicator steps
- AC-13 loading, empty and error · covered by the five grid state steps
- AC-14 the base components · covered by the component and overlay focus steps
- AC-15 Inter, self hosted · covered by the network and Geist steps
- AC-16 no image assets · covered by the `/icon`, `/opengraph-image` and venue name steps
