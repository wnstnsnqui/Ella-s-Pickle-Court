# Verify: Landing look on every screen · spec 0018 · updated 2026-10-05 (AC-1 and AC-9 amended)

_Steps derived from spec 0018 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Sign in for staff screens with the test login kept in memory. Use a day ahead (`?date=` tomorrow) wherever a step needs hours that have not started yet. Before any write on a live board (a booking, a closure), note what was there and put it back afterwards.

## UI / manual

- [ ] `npx playwright test`: all three landing screenshots (`/` at 375 and 1280, the open checkout card) match their baseline → AC-1
- [ ] Any staff screen: the header is the glass bar, 64px tall, no yellow band, the mark on the left; at 1280 the staff links are round pills in ink text, below 1024 they fold into the menu button → AC-3
- [ ] Scroll any staff page 100px: the header gains its hairline; at the top it has none (Chromium) → AC-3
- [ ] `/staff` and `/schedule`: the content column is as wide as the landing's (`max-w-6xl`), the page grey, the board in one white card → AC-3, AC-5
- [ ] Every screen: yellow appears only on a Selected tile, a step button inside a sheet or dialog, a hovered menu row, the mark's letter, and the report charts. Book, Save hours, Sign in, Create account, Set password and Make a link are ink; the reports range chip in force is ink → AC-4
- [ ] Press and hold any button on a staff screen, and a free tile on `/staff`: it scales down slightly and springs back → AC-4, AC-6
- [ ] `/staff` at 1280: the card holds, top to bottom, the day heading with the online checks chip on its right, the strip with the calendar at its end, the legend, the grid → AC-5
- [ ] `/schedule` and `/staff` with the network throttled offline after load, then press Try again: the error state renders inside the card; on a closed day the closed panel renders inside the card (staff keeps Add booking) → AC-5
- [ ] Tiles: 6px apart; Available has a soft edge that firms up on mouse hover only; Booked, Unavailable, Outside opening hours and Saving show no edge; Selected is outlined with a small shadow; the icon is bold beside a word → AC-6
- [ ] With two courts, the word shows at every width; with three or more (add a court in Settings, then retire it after), the word hides below 640px and shows from 640px → AC-6
- [ ] `/staff`: a Booked tile shows the customer's name (with the globe on an online booking) at 375 and at 1280; `/schedule` shows "Booked" → AC-6
- [ ] Keyboard: one Tab reaches the grid, arrow keys move the ring at once with no animation, Home, End, Page Up and Page Down work, Enter picks an hour → AC-6, AC-14
- [ ] The legend: each view's icon beside its word, no coloured squares; on staff all seven views, on public the three (plus Outside opening hours when the day has some) → AC-7
- [ ] Day strip at 375: one row that scrolls sideways, the chosen day on a white fill; at 1280: seven days in a grey track with round week arrows, the white highlight slides to a tapped day → AC-8
- [ ] Screen reader or the accessibility tree: each day is a radio named "Today, Mon 5 Oct" or "Tue 6 Oct", with ". Closed" on a closed weekday, whose short weekday is struck through → AC-8
- [ ] Pick a day in the strip: the highlight and the heading move at once, the grid dims with `aria-busy` until the day lands; pick one with the calendar: the calendar button spins → AC-8
- [ ] Day switch failure (block `/api/schedule` in devtools, pick a day): the highlight and the heading snap back, the toast shows, nothing stays dimmed → AC-8
- [ ] `/staff?date=` a past day: no day in the strip is highlighted, the heading reads "· past"; the calendar still reaches past days on staff and not on public → AC-8
- [ ] `/design`, The live pill: green pill with a pinging dot; press Channel dropped: muted pill with a still dot, then after 3 seconds a red tinted pill with a warning icon and the age. Neither board shows a pill (AC-9 as amended) → AC-9
- [ ] `/staff` at 1280 with nothing picked: "Your selection" card beside the grid with "Pick free hours to book or close them" and no buttons; pick two hours on two courts: the day, "Court 1: 5am to 6am" style lines, the booking count, Book (ink), Close hours, Clear; the grid's width does not change → AC-10
- [ ] `/staff` at 375: no summary until an hour is picked; then a glass card floats 12px above the bottom, rising in; Clear makes it sink out → AC-10
- [ ] Book, then Escape: focus returns to the Book button; after a real booking lands, focus goes to the grid → AC-10, AC-11
- [ ] Every sheet (book, details, edit, close hours, closed day, court, user, the calendar on a phone, the online bookings list and booking): from 768px it slides in from the right, 8px in from the edges, at most 28rem wide; below 768px it rises from the bottom 8px in; round corners, soft dim; its header has a duotone icon in a grey square → AC-11
- [ ] In a sheet: Tab stays inside, Escape closes, the body scrolls inside the sheet, footer buttons are 48px tall and press → AC-11
- [ ] Settings, Reports, Staff accounts, Your account: a "Back to the board" round pill, an amber uppercase eyebrow (Venue, Usage, Team, Signed in), the title, a muted lede; every section a white card with a duotone icon chip, rows split by hairlines; nothing reveals on scroll → AC-12
- [ ] Reports: the three charts and the day list sit in section cards; hover a bar: the tooltip is rounded with a ring → AC-12
- [ ] Sign in, sign up (an invite link) and reset (a reset link): one centred white card at most 24rem wide on the grey page, 44px fields, an ink submit, the glass header above → AC-13, AC-4
- [ ] `/nope`: the not found message is a white card on the grey page under the glass header; a refused day on `/schedule?date=2000-01-01` and the switched off account notice read the same way → AC-13
- [ ] `/privacy` and `/terms`: under the glass header, the reading column unchanged → AC-13
- [ ] Reduced motion on (devtools rendering emulation): nothing slides or scales, sheets and the floating summary only fade, the strip highlight jumps, a changed cell keeps a steady ring → AC-14
- [ ] Reduced transparency on: the header and the floating summary are solid white → AC-14
- [ ] 375 by 667, on both boards with a day ahead: at least seven full rows visible, rows 48px, no sideways page scroll → AC-15
- [ ] 1280 wide at 200% zoom on both boards, settings and reports: nothing cut off or overlapping, no sideways page scroll → AC-15
- [ ] `/design`, Contrast: "All 36 pairs meet WCAG AA", including the three ink focus rows (on the page, a card, the grey page), the ink button, every tile's text on its own fill, and the header links and focus ring on the glass over ink → AC-16
- [ ] Greyscale (devtools rendering emulation) on `/design` The tiles: every view still tells apart by icon and word → AC-16
- [ ] `/design` shows the recipes and the ink button, the board card with the strip and a live pill, the pill's three readings, every tile view with and without a name, a floating sheet, `PageHeading` and `SectionCard` → AC-18
- [ ] `docs/design.md` describes the landing look at a working tempo, the recipes, the motion budget, the yellow rule, the frozen landing, the component list, and says light only with no dark theme text → AC-18

## Value sourcing

- [ ] Heading: open `/staff` near midnight venue time on a device set to another timezone (devtools sensors, e.g. America/Los_Angeles): "Today, " follows venue today from the server's `now` in `Asia/Manila`, not the device → Value sourcing: "Today, " and "· past"
- [ ] Heading while a day is read: throttle the network, pick a day; the heading names the picked day before the grid changes → Value sourcing: the day heading
- [ ] Strip: the first day is venue today and the last is today plus the booking horizon in Settings; change the horizon (note it, put it back) and reload: the strip's length follows → Value sourcing: which days it offers
- [ ] Strip: mark a weekday closed in Settings (note it, put it back): that weekday's short name is struck through and its radio name ends ". Closed" → Value sourcing: which weekdays read Closed
- [ ] Strip highlight: the pending day while reading, else the landed day, none for a past day → Value sourcing: which day is highlighted
- [ ] Tile word: two courts show the word on a phone; three or more hide it below 640px; staff names always show → Value sourcing: whether the word shows
- [ ] Tile name: a staff booking's customer name appears on every hour it covers; the public board says "Booked" → Value sourcing: the word or the customer's name
- [ ] Summary: pick 5am and 6am on Court 1 and 9am on Court 1: "Court 1: 5am to 7am, 9am to 10am", "2 bookings"; the day is the landed day → Value sourcing: day, runs by court, bookings count
- [ ] Online chip: the count matches the online bookings list → Value sourcing: the count of bookings to check
- [ ] Sheet icons: each sheet shows the icon in the spec's table (the online sheets a globe) → Value sourcing: the icon
- [ ] Page headings: Settings/Venue, Reports/Usage, Staff accounts/Team, Your account/Signed in, ledes unchanged → Value sourcing: eyebrow, title and lede
- [ ] Header hairline: appears after scrolling, with no script involved (it is a scroll timeline) → Value sourcing: the hairline after scrolling

## Commands

- [ ] `npx playwright test` → 3 passed, the landing matches its baseline → AC-1
- [ ] `git diff 4e0986a -- components/landing 'app/(landing)' components/receipt components/wordmark.tsx components/staff/confirm-dialog.tsx components/ui/dialog.tsx components/ui/form.tsx components/ui/label.tsx components/ui/skeleton.tsx` → empty → AC-1
- [ ] `git diff 4e0986a -- components/ui/input.tsx components/ui/textarea.tsx components/ui/select.tsx components/ui/checkbox.tsx components/ui/switch.tsx components/ui/badge.tsx components/ui/calendar.tsx components/ui/button.tsx components/ui/sonner.tsx` → only the focus classes, the `ink` variant, and the toaster's `light` theme and description colour (AC-1, amended) → AC-1
- [ ] Tab into a field on a staff sheet, on sign in, and in the landing's checkout card: an ink edge with a faint halo, no amber; Tab onto a button, the ink button included, on a white card and on the grey page (the "Back to the board" pill): a crisp ink outline with a see through gap, no white fringe → AC-1
- [ ] Tab onto the retired courts toggle (settings), a proof thumbnail, an online checks row and a radio card in the check steps (staff board): a 2px ink outline with a see through gap, no white fringe → AC-1
- [ ] With the device in dark mode, raise a toast on `/design`: dark title and grey description on white → AC-1
- [ ] `git diff 4e0986a -- app/globals.css | grep '^-[^-]'` → empty (only additions) → AC-1
- [ ] Add `rounded-lg` to a class in `components/staff/summary-card.tsx`: `npm run lint` fails with the AC-17 message; the same class in `components/landing/` does not. Revert → AC-17
- [ ] `npm run check` → lint, format, typecheck and tests pass (on a loaded machine, a cold first test can time out at 5 seconds; `npx vitest run --testTimeout=60000` settles it) → all

## Acceptance-criteria coverage

- AC-1: playwright compare, the two `git diff` commands · AC-2: recipes on `/design`, press step · AC-3: header steps · AC-4: yellow rule, press, sign in steps · AC-5: board card, states steps · AC-6: tile, word rule, names, keyboard steps · AC-7: legend step · AC-8: strip, names, signals, failure, past day steps · AC-9: `/design` pill step (boards deliberately without it) · AC-10: summary aside, floating, focus steps · AC-11: sheet steps · AC-12: page heading, reports steps · AC-13: auth, notice, legal steps · AC-14: keyboard, reduced motion and transparency steps · AC-15: phone and zoom steps · AC-16: contrast and greyscale steps · AC-17: lint command · AC-18: `/design` and `docs/design.md` steps
