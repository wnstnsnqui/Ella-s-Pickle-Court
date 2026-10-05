# 0018. The landing look on every screen: shared recipes, the landing board on both boards, a frozen landing page

**Date**: 2026-10-04 (amended 2026-10-05: AC-1 for the ink focus look on shared controls, AC-9 so the live pill stays off both boards)
**Status**: Accepted

## Summary

The landing page at `/` has a look the rest of the app does not: soft round cards with a hairline ring, a glass header, a dark ink main button, yellow saved for what you picked, a board in a white card with roomy tiles and a sliding day strip, and buttons that give a little when pressed. This spec carries that look to every screen that uses `AppShell` (the staff board, settings, reports, users, account, the public board at `/schedule`, sign in and the legal pages), and makes the staff and public boards look like the landing page's board. The landing page itself is frozen: none of its files change and it must render exactly as it does today. Staff screens keep a working tempo, so they borrow the landing's materials and small motions but none of its scroll reveals or arrival cascades. Two amendments since: every field and button, the landing's included, now shows focus in ink instead of a muddy amber halo, and the live pill is restyled but stays off both boards.

## Requirements

**User stories**

- As a staff member, I want the board I work on all day to look and feel like the venue's own site, so the tool feels made for this place rather than bolted on.
- As a player who taps "Live schedule" on the landing page, I want `/schedule` to look like the board I just saw, so I know I am in the same place.
- As a staff member glancing between rallies, I want the softer look to stay as quick to read as today, with the state of every hour clear in glare and with colour removed.
- As the engineer, I want the landing's recipes to exist once as named pieces, so a new screen composes the look instead of copying class strings.
- As Ella, I want the landing page to stay exactly as it is, because it is finished and verified.

**Acceptance criteria** (the contract, each independently checkable)

- **AC-1**: The landing page is frozen. No file under `components/landing/` or `app/(landing)/` changes. The landing rules already in `app/globals.css` (the `landing-*` and `checkout-*` keyframes, `[data-rise]`, `[data-reveal]`, `[data-ping]`, `[data-landing-header]`, `[data-glass]`, the checkout card and step rules, `--dur-enter`, `--dur-step`, `--curve-out`, `--curve-in-out`) stay byte identical. Every shared module the landing imports (`components/ui/button`, `dialog`, `form`, `input`, `label`, `checkbox`, `skeleton`, `components/wordmark`, `components/staff/confirm-dialog`, `components/receipt/receipt-card`, `components/receipt/receipt-view`, every existing token value) keeps its existing defaults; a staff form gets the new look by styling its fields where it uses them, never by changing `form.tsx`; anything this spec adds is opt in (a new variant, utility, token or component). **One amended exception, the focus look on shared controls**, which changes everywhere, the landing included: a field (`input`, `textarea`, the `select` trigger) shows focus as a `--foreground` (ink) edge with a 3px halo of `--foreground` at 10 percent; a `button`, `checkbox`, `switch`, `badge` and the calendar's focused day show a crisp 2px `--foreground` outline with a 2px see through offset (`outline-offset`, never a painted `ring-offset`), so the gap shows whatever surface sits behind the control, white card or grey page alike; a destructive button takes the same outline in `--destructive`. No `--ring` amber halo (`ring-ring/50`) remains on any control. The global amber `:focus-visible` outline stays for everything else (tiles, the day strip, links). The shared toaster (`components/ui/sonner.tsx`, mounted by the root layout) is pinned to `theme="light"` with its description in `--muted-foreground`, so a device in dark mode cannot repaint a toast on any page. Nothing else the landing imports changes. Screenshots of `/` at 375 and 1280 pixels wide, and of the open checkout card, match a baseline with a fixed clock, the live parts masked and held at a fixed height (so a short day and a long day give the same page), and the dev server's badge hidden; the baseline was retaken on 2026-10-05 after the focus change, which no screenshot shows because nothing in them is focused.
- **AC-2**: The landing's recipes exist once as Tailwind utilities in `app/globals.css`, beside the tokens: `press` (scale 0.97 on press, transitions on `scale`, `translate`, `background-color` and `color` only, 150ms on `--curve-out`), `surface-card` (card fill, a `ring-1` hairline in `--border`, `rounded-3xl`, `shadow-sm`), `surface-glass` (background at 80 percent with a backdrop blur and saturate, solid `--background` with no blur under `prefers-reduced-transparency: reduce`), `elevation-float` (the hero board's deep shadow tinted from `--foreground` at 18 percent plus its 6 percent ring), and `chip-icon` (a `size-11` `rounded-2xl` `--muted` square that holds a duotone icon). Two tokens are added: `--curve-drawer` at `cubic-bezier(0.32, 0.72, 0, 1)` and `--dur-sheet` at `300ms`. `Button` gains one new variant, `ink` (`--mark` fill, `--mark-foreground` text, `--mark` at 90 percent on hover), and no existing variant or size changes.
- **AC-3**: `AppShell`'s header is the landing's glass header: sticky, 64px tall, `surface-glass`, clear at the top of the page and given a `--border` hairline once content has scrolled 96px under it (a CSS scroll timeline on a new `[data-shell-header]` selector, reusing the `landing-edge` keyframes by name; no script). There is no yellow band. The wordmark sits left; signed in, the staff links show as `rounded-full` pills (`text-label`, `--foreground`, `--muted` fill on hover) from 1024px and fold into the existing `NavMenu` below that. The header holds no toolbar any more: day navigation and the live reading move into the board card (AC-5). The content column widens from `max-w-5xl` to the landing's `max-w-6xl`.
- **AC-4**: On every `AppShell` screen, yellow (`--brand`, `--primary`, `--accent`) appears only on Selected tiles, the default (yellow) button for a step inside a sheet or dialog, hovered menu rows, the mark's letter, and the report charts' ramp. The one main action on a page surface uses the `ink` variant (Book and Close on the summary card, Save in settings, Sign in, Create account, Set password); secondary actions are `outline` or `ghost`. Every button on these screens carries `press` and is at least 44px tall where it is a main or step action (`h-12` for main and step actions, as the landing uses).
- **AC-5**: On `/staff` and `/schedule` the board sits in one `surface-card` (padding 12px below 640px, 16px to 24px above, as the landing's booking card), on a `--muted` page background, as the landing's `#book` band. Inside the card, top to bottom: a header row with the day heading (`text-title`, tabular, "Today, " in muted text when it is venue today, "· past" after it on a past day) and, on its right on staff, the online checks chip (spec 0016); no live pill sits there (AC-9); the day strip with the calendar button (AC-8); the legend (AC-7); the grid (AC-6). The loading skeleton, the error state with its retry, the no courts empty state and the closed all day state render inside the same card. Closed all day reads as the landing's closed panel (`text-body`, muted, centred, `--muted` fill, `rounded-2xl`), keeping any staff action spec 0005 or 0007 gives it.
- **AC-6**: Grid cells take the landing tile look and keep every contract of spec 0003 (the ARIA grid, one tab stop, arrow keys, Home, End, Page Up and Page Down, the inset focus ring, the seven `CellView` views and their accessible names, the changed cell highlight, the Now marker). The look: 6px between tiles; `rounded-cell`; Available with its `-border` at 30 percent, full strength on hover for a fine pointer only; Booked, Unavailable, Out of hours and Saving with no visible border; Selected with its full `-border` and `shadow-sm`; Failed unchanged. The icon (bold weight) and the word sit side by side, by the landing's exact `roomy` rule: with two courts or fewer the word always shows; with more it shows from 640px and is hidden below, truncated whenever it does not fit. On the staff board a Booked tile shows the customer's name (with the lock and the online globe of specs 0005 and 0016) where the public board shows "Booked", at every width and truncated, as the staff caption does today. A pressable tile presses to scale 0.96, transitions naming `scale`, `background-color`, `border-color` and `color`, 150ms on `--curve-out`. The time column is `text-caption`, muted, tabular and left aligned, with its "Time" header kept for screen readers only; court headers are `text-label` at medium weight. Past and locked tiles keep their own view, dimmed as today (the landing's dashed Past tile is a picker idea and is not used on the boards). Row height stays `--row-h`.
- **AC-7**: The legend is the landing's: each view's bold icon beside its word in muted `text-caption`, no coloured swatch, wrapping onto a second line on a phone. It still names every view the board can show and is never behind a tap (spec 0003 AC-6 holds).
- **AC-8**: Both boards use one shared `DayStrip`, built in `components/day-strip.tsx` to match the landing's strip (the landing keeps its own copy, AC-1). Each day is a native radio named "Today, Tue 29 Sep" or "Wed 30 Sep", with ". Closed" added on a closed weekday, whose short weekday is struck through. The strip runs from venue today through today plus the booking horizon. Below 1024px it is one row the thumb scrolls sideways, the chosen day on a `--card` fill with `shadow-sm`; from 1024px it shows seven days at a time inside a `--muted` `rounded-2xl` track, paged by round outline week arrows, with a `--card` highlight that slides to the chosen day (`translate`, 250ms, `--curve-in-out`) and jumps under reduced motion. The calendar button (`DatePicker`, spec 0011) sits at the end of the strip's row and still reaches every day the board allows, including past days on staff. When the day on screen is not in the strip (a past day), no day is highlighted. `DayNav` is retired from both boards. The three day switch signals of spec 0014 AC-2 become: the strip highlight moves to the picked day at once (the pressed control's own feedback; the calendar trigger still spins when it is the control used), the heading names the target day at once, and the grid dims with `aria-busy` until the day lands; a failed read snaps the highlight and heading back with the existing toast.
- **AC-9**: `LiveIndicator` renders as the landing's live pill (`text-label`, `rounded-full`, `px-3 py-1`): live is the `--state-available` fill and foreground with the pinging dot (the existing `[data-ping]` animation, which already sits behind `prefers-reduced-motion: no-preference`); reconnecting is a `--muted` pill with a still muted dot; not live is a `--destructive` pill at 10 percent fill with destructive text, a warning icon and the age of the data. Only the live reading pings. The three readings, the 3 second delay and the age rule of spec 0003 AC-12 are unchanged. **Neither board renders it** (amended 2026-10-05): `/staff` and `/schedule` show no live pill, by the engineer's product call (first made on 2026-09-16, commit `d8c725b`, and confirmed during this build). `/design` shows it in all three readings, so it stays ready if a board takes it back.
- **AC-10**: The staff selection becomes the landing's summary card. From 1024px the board card and a 20rem `surface-card` aside sit side by side (`lg:grid-cols-[1fr_20rem]`), the aside sticky at 96px from the top. It is titled "Your selection" and lists the day, the picked hours as runs grouped by court ("Court 1: 5pm to 7pm"), and how many bookings that makes; Book (`ink`, `h-12`, full width), Close hours (`outline`) and Clear (`ghost`) sit under it. With nothing picked, the aside stays in place with a muted line, "Pick free hours to book or close them", and its actions hidden, so the grid never changes width. Below 1024px the same content is a floating card pinned 12px above the bottom edge (`surface-glass`, `rounded-3xl`, `elevation-float`), present only while something is picked; it rises 8px and fades in over `--dur-step` on `--curve-out` and leaves over `--dur-fast`, fading only under reduced motion. Focus return after Book and Close still follows spec 0005 AC-15.
- **AC-11**: Every `BoardSheet` (book, details, edit, close, closed day, court, user, and the calendar's phone fallback) floats: from 768px it enters from the right, inset 8px from the top, right and bottom edges, at most 28rem wide; below 768px it enters from the bottom, inset 8px from the sides and bottom. It is `rounded-3xl` with a hairline ring and `elevation-float`, over `--overlay-soft` (the checkout card's dim) instead of `--overlay`. It enters over `--dur-sheet` on `--curve-drawer` and leaves along the same path, faster, over `--dur-step`; under reduced motion it only fades. Its header is the checkout card's: a duotone icon in `chip-icon`, the title in `text-title`, the description in muted `text-caption`. Footer buttons are `h-12` with `press`; the step that commits is the default yellow button. The focus trap, Escape, the body scrolling inside the sheet and the return of focus (spec 0005 AC-15) are unchanged.
- **AC-12**: Settings, reports, staff accounts and your account open with a shared `PageHeading`: an eyebrow (`text-label`, `--link`, uppercase, wide tracking), the title in `text-display` (not the fluid `text-headline`), and a muted lede at most 56 characters wide, on a `--muted` page. A "Back to the board" link above it is a `rounded-full` ghost pill with an arrow. Each section is a shared `SectionCard` (`surface-card`, 20px to 24px padding) whose header is a duotone icon in `chip-icon`, a `text-title` heading and a muted caption, with its action on the right; rows inside a card are divided by `--border` hairlines, not boxes. Report charts and their tooltip sit in `SectionCard`s, the tooltip `rounded-2xl` with a ring. Nothing on these pages reveals on scroll or arrives in a cascade.
- **AC-13**: Sign in, sign up, reset, privacy, terms, `/design`, the app error page and the not found page (`app/not-found.tsx`, which moves onto `AppShell`) sit under the glass header. The sign in, sign up and reset forms are a centred `surface-card` at most 24rem wide on a `--muted` page, with `h-11` fields and an `ink` submit. `BoardNotice` (signed out, switched off and could not load on `/staff`, and a refused day) and the not found page show their message as a `surface-card` on a `--muted` page. The legal pages keep their reading column.
- **AC-14**: Motion on `AppShell` screens is limited to: `press` on buttons and tiles, the day strip highlight, sheet enter and exit, the summary card's enter and exit below 1024px, the live dot's ping, the existing grid dim, changed cell highlight and spinners. No scroll reveal, rise cascade, hover lift or fluid type. Hover changes only colour or border, and only for a hover capable fine pointer. Arrow key moves inside the grid never animate. Outside `components/ui/` and the frozen landing files, no class uses `transition-all`; every transition names its properties. Under reduced motion, movement stops and fades stay; under reduced transparency, every glass surface is solid.
- **AC-15**: Spec 0003 AC-7 still holds on both boards: on a 375 by 667 viewport at least seven full slot rows are visible below the header, the card's header row, the day strip and the legend, rows stay at least 44px tall, and the layout survives 200 percent zoom with nothing lost or overlapped. On a phone the board card's padding drops to 12px and the page gutter to 8px to make the room. The budget on 667px: header 64, gap above the card 8, card padding 12, heading row with its gap 40, day strip with its track and gap 76, legend with its gap 28, court headers 28, and seven rows of 48 plus a 6px gap, 378; 634 in all, 33 spare. If the real build misses, tighten in this order and no further: the card's inner gaps from 12px to 8px, the strip's days from 56px to 48px tall, then the legend becomes one row that scrolls sideways.
- **AC-16**: Spec 0003 AC-4 is amended for grid tiles only: a tile's border is no longer held to 3:1 against the page, because the tile's icon and word identify its state and are held to 3:1 (icon) and 4.5:1 (word) against the tile's own fill. Every other pair keeps its bar: `--input` and the focus ring at 3:1, text at 4.5:1. New pairs are measured on `/design`: `--mark-foreground` on `--mark` (the `ink` button), every view's foreground on its fill, and the header's text on the glass at its worst case, the glass composited over `--mark` (the darkest surface that can scroll under it). The header's pills and links use `--foreground` at rest, not `--muted-foreground`, so they hold 4.5:1 over that worst case. The ink focus look of AC-1 is measured too, as labelled rows: the focus edge and outline (`--foreground`) on `--background`, on `--card` and on `--muted`, each at 3:1.
- **AC-17**: An ESLint rule in `eslint.config.mjs` fails `npm run lint` on `transition-all`, `rounded-md` or `rounded-lg` in a class string under `app/` or `components/`, except in `components/ui/`, `components/landing/`, `app/(landing)/`, `app/design/`, and the frozen shared modules the landing imports from outside those folders (`components/wordmark.tsx`, `components/staff/confirm-dialog.tsx`, `components/receipt/`), which AC-1 forbids changing. Prettier still owns layout; the rule is about the look, never formatting.
- **AC-18**: `/design` shows every recipe of AC-2 and the `ink` button, the board card with the day strip and the live pill in all three readings, a tile in every view with and without a name, a floating sheet, `PageHeading` and `SectionCard`, and its contrast list matches AC-16. `docs/design.md` is rewritten to match: the character is the landing look at a working tempo, the recipes and when to use each, the motion budget of AC-14, the yellow rule of AC-4, the frozen landing rule of AC-1, the updated component inventory, and light only throughout (the stale dark theme text spec 0003 Follow-up names is removed).

## Decision

**Chosen option**: Option 2: shared recipes as Tailwind utilities plus a few new components, opt in everywhere, with the landing page frozen and used as the reference.

The landing's materials become named utilities in the one token layer, its structural pieces become a handful of shared components (`DayStrip`, `PageHeading`, `SectionCard`, `BoardCard`, `SummaryCard`, the live pill), and `AppShell`, `ScheduleGrid`, `ScheduleCell`, `StateLegend`, `LiveIndicator` and `BoardSheet` are restyled onto them. Nothing the landing imports changes its defaults, so the landing renders exactly as it does now.

**Implementation skills**: `emil-design-eng` (`emilkowalski/skills`, `.agents/skills/emil-design-eng/`) · `animate` (`emilkowalski/skills`, `.agents/skills/animate/`) · `apple-design` (`emilkowalski/skills`, `.agents/skills/apple-design/`) · `tailwind-4-docs` (`lombiq/tailwind-agent-skills`, `.agents/skills/tailwind-4-docs/`) · `shadcn` (`shadcn/ui`, `.agents/skills/shadcn/`) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`) · `playwright-cli` (`microsoft/playwright-cli`, `.agents/skills/playwright-cli/`)

## Rationale

The reasoning, the four options weighed, and the inventory of what gives the landing its feel: see [rationale.md](rationale.md).

## Feature design

**Design source**: the landing page as committed at the start of the build (task 0), read from its code: `components/landing/landing-header.tsx`, `hero.tsx`, `hero-board.tsx`, `offers.tsx`, `section-heading.tsx`, `booking-section.tsx`, `booking-picker.tsx` (the board card, `DayStrip`, `HoursTable`, `Legend`, the summary aside), `checkout-sheet.tsx` (the card header and footer), `press.ts`, and the landing rules in `app/globals.css`. Where this spec and that code disagree on a value, the landing code wins, except where an AC here says otherwise for a working screen.

**Data model**: none. No table, column, migration or stored value changes.

**Recipes** (all in `app/globals.css`; each a Tailwind 4 `@utility` so it works in any server or client file and composes with other classes)

| Utility           | What it is, from the landing                                                                 | Used on                                                         |
| ----------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `press`           | `press.ts`: active scale 0.97, named transitions, 150ms, `--curve-out`                         | every button on `AppShell` screens                               |
| `surface-card`    | the booking card and offer tiles: card fill, ring hairline, `rounded-3xl`, `shadow-sm`          | board card, summary card, section cards, auth card              |
| `surface-glass`   | the landing header and the hero chip: 80 percent background, blur, saturate, solid fallback     | `AppShell` header, the phone summary card                        |
| `elevation-float` | the hero board's tinted deep shadow and faint ring                                            | floating sheets, the phone summary card                          |
| `chip-icon`       | the offer tiles' `size-11 rounded-2xl` muted square                                           | sheet headers, section card headers                              |

New tokens: `--curve-drawer` (`cubic-bezier(0.32, 0.72, 0, 1)`, the iOS drawer curve) and `--dur-sheet` (`300ms`), exposed as `ease-drawer` and used only by the sheet. Everything else reuses the tokens the landing already uses (`--dur-fast`, `--dur-step`, `--curve-out`, `--curve-in-out`, `--overlay-soft`).

**Component surface**

| Component         | Kind   | Key inputs                                                       | States it must render                                                   | Source                                        |
| ----------------- | ------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------- |
| `AppShell`        | server | `children`, `staff` slot, `className`, `muted` (page background)  | signed in, signed out, scrolled, reduced transparency                    | restyled; `toolbar` prop removed               |
| `BoardCard`       | server | `header`, `children`                                               | fixed                                                                    | new, `surface-card`                            |
| `DayStrip`        | client | `date`, `pendingDate`, `today`, `horizonDays`, `closedDays`, `onPick` | today, a day in range, a past day (no highlight), pending, narrow, wide  | new, modelled on the landing's strip            |
| `DatePicker`      | client | as spec 0011                                                       | as spec 0011                                                             | unchanged, placed at the strip's end           |
| `LiveIndicator`   | client | as spec 0003                                                       | live (ping), reconnecting, not live with age                             | restyled as the landing pill; on `/design` only, no board renders it (AC-9) |
| `ScheduleGrid`    | client | as spec 0003                                                       | as spec 0003, inside `BoardCard`                                          | restyled                                       |
| `ScheduleCell`    | client | as spec 0003, plus `roomy`                                          | seven views, named or not, focused, locked, past, changed                | restyled to the landing tile                   |
| `StateLegend`     | server | `views`                                                            | fixed                                                                    | restyled to the landing legend                 |
| `SummaryCard`     | client | `runs`, `day`, `onBook`, `onClose`, `onClear`                       | empty (wide only), picked, wide aside, floating phone card               | replaces `SelectionBar`                        |
| `BoardSheet`      | client | as today, plus `icon`                                              | right inset, bottom inset, compact, reduced motion                       | restyled on `components/ui/sheet`              |
| `PageHeading`     | server | `eyebrow`, `title`, `lede`, `back`                                  | with and without back link                                               | new, the landing's `SectionHeading` at working size |
| `SectionCard`     | server | `icon`, `title`, `description`, `action`, `children`                | with and without action                                                   | replaces `SettingsSection`, used by every page  |
| `Button`          | mixed  | adds variant `ink`                                                  | as shadcn                                                                | one variant added, nothing else changed         |
| `BoardNotice`     | server | as today                                                            | as today                                                                 | restyled to a `surface-card` on a muted page    |

`StaffToolbar` and `PublicToolbar` are deleted: their contents become the board card's header row and the strip row.

`components/ui/sheet.tsx` may change its defaults (the landing does not import it). `components/ui/dialog.tsx`, `button.tsx` defaults, `form.tsx`, `input.tsx`, `label.tsx`, `checkbox.tsx`, `skeleton.tsx`, `components/wordmark.tsx`, `components/staff/confirm-dialog.tsx` and `components/receipt/` may not (AC-1), with one amended exception: the focus classes on `input`, `textarea`, `select`, `button`, `checkbox`, `switch`, `badge` and `calendar`, and the toaster's theme and description colour in `sonner.tsx` (AC-1).

**Sheet icons** (duotone, Phosphor; a constant per sheet)

| Sheet                      | Icon               |
| -------------------------- | ------------------ |
| Book                       | `CalendarPlus`     |
| Details                    | `CalendarCheck`    |
| Edit                       | `PencilSimple`     |
| Close hours                | `Prohibit`         |
| Closed day                 | `CalendarX`        |
| Court                      | `CourtBasketball`  |
| User                       | `UserCircle`       |
| Calendar (phone fallback)  | `CalendarDots`     |

**Page headings**

| Page            | Eyebrow     | Title (unchanged)  | Lede (unchanged) |
| --------------- | ----------- | ------------------ | ---------------- |
| Settings        | Venue       | Settings           | as today         |
| Reports         | Usage       | Reports            | as today         |
| Staff accounts  | Team        | Staff accounts     | as today         |
| Your account    | Signed in   | Your account       | as today         |

**Value sourcing**

| Surface        | Value shown                                   | Source                                                                                                           |
| -------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Board card     | the day heading                               | the schedule hook's landed day, or `pendingDate` while a read is in flight (spec 0014), formatted by `formatDayHeading` |
| Board card     | "Today, " prefix and "· past" suffix          | the shown date compared with venue today, which is `schedule.now` in `schedule.grid.timezone`, as `DayNav` computes it today |
| Day strip      | which days it offers                          | venue today through today plus `schedule.horizonDays` (spec 0002)                                                |
| Day strip      | which weekdays read Closed                    | `closedDaysOf(schedule.hours)`, as both toolbars pass to `DayNav` today                                           |
| Day strip      | which day is highlighted                      | `pendingDate` when set, else the landed day; none when that day is outside the strip                             |
| Live pill      | live, reconnecting or not live, and the age   | on `/design` only (AC-9): the preview's own sample channel status and clock; no board reads it                     |
| Online chip    | the count of bookings to check                | unchanged, spec 0016                                                                                             |
| Tile           | its view, icon and accessible name            | `cellViewFor` and `CELL_VIEW_ICON` / `CELL_VIEW_NAME`, spec 0003                                                  |
| Tile           | the word or the customer's name               | the view's name on `/schedule`; `cellCaptions` on `/staff` (specs 0005 and 0016)                                   |
| Tile           | whether the word shows (`roomy`)              | derived: `grid.courts.length <= 2` shows it always; otherwise a `sm:` (640px) breakpoint, the landing's exact rule; staff names always show |
| Summary card   | day, runs by court, bookings count            | `summarizeRuns(runs)` and `describeSummary` from today's `SelectionBar`; the day is the landed day                 |
| Sheet header   | the icon                                      | the sheet icon table above                                                                                       |
| Page heading   | eyebrow, title and lede                       | the page heading table above                                                                                     |
| Header         | the hairline after scrolling                  | a CSS scroll timeline, no value from code                                                                        |

**Key invariants**

1. **The landing is the reference and is never edited** (AC-1). A shared change that would alter how the landing renders is a defect, whatever it improves elsewhere. The one deliberate exception is the ink focus look on shared controls and the light pinned toaster (AC-1, amended 2026-10-05); any further change to a frozen module needs its own amendment here first.
2. **Recipes live once.** A material (press, card, glass, float, icon chip) is a utility in `app/globals.css`; a component names the utility, never a copied class string. The landing's own copies are the one exception, and they are frozen.
3. **Opt in, never redefault** on anything the landing imports.
4. **Yellow means picked or next** on `AppShell` screens (AC-4).
5. **Working tempo** (AC-14): motion that a staff member sees tens of times a day is near invisible and under 300ms; nothing reveals, cascades or lifts.
6. **The grid's contract is untouched.** Keyboard, ARIA roles, the seven views and their names, `CELL_STATES` at three, the changed cell highlight and the per request render all stay exactly as specs 0003, 0005, 0006 and 0014 define them. Only the look changes.
7. **Every spec 0003 invariant still holds**: one token layer, no `dark:`, colour never the only signal, focus never removed, motion optional, light only.

**Security model**

Nothing here reads or writes data. The staff only controls in the header are still shown through `currentSession()` as a convenience, and the row level security policies of spec 0002 remain the enforcement point.

**Configuration required**

None.

**Critical test scenarios**

- Frozen landing: `git diff` against the build's base shows no change under `components/landing/` or `app/(landing)/`, the frozen shared modules differ only by the focus classes and the toaster change AC-1 names, and the screenshot compare at 375 and 1280 pixels and with the checkout card open matches the baseline, verifies **AC-1**
- Focus: Tab into a field anywhere (a staff sheet, sign in, the landing's checkout card): an ink edge with a faint halo, no amber; Tab onto a button, the ink button included, on a card and on the grey page: a crisp ink outline with a see through gap, no white fringe; a toast on a device in dark mode reads dark text on white, verifies **AC-1**
- Staff board at 1280 pixels: glass header with no yellow band, the board in a white card on a grey page, day strip with a sliding highlight and the calendar at its end, landing tiles with names, the summary card beside the grid, verifies **AC-3**, **AC-5**, **AC-6**, **AC-8**, **AC-10**
- Phone at 375 by 667: seven full rows visible, the strip swipes, picking hours brings up the floating summary card, Book opens a sheet from the bottom inset 8px, verifies **AC-10**, **AC-11**, **AC-15**
- Keyboard: one Tab reaches the grid, arrows move without animation, the strip's radios move with arrow keys, focus returns to the opener after a sheet closes, verifies **AC-6**, **AC-8**, **AC-11**, **AC-14**
- Day switch failure: a refused day snaps the strip highlight and heading back with the toast and leaves nothing dimmed, verifies **AC-8**
- Realtime readings on `/design`: the pill goes muted, then destructive with the age, and back to the pinging green pill; neither `/staff` nor `/schedule` shows a pill, verifies **AC-9**
- Reduced motion and reduced transparency: nothing slides or scales, sheets fade, the highlight jumps, the header and phone card are solid, the changed cell keeps its steady ring, verifies **AC-9**, **AC-11**, **AC-14**
- Contrast and grayscale on `/design`: every pair in AC-16 at AA, every view distinguishable with colour removed, verifies **AC-16**, **AC-18**
- Lint: a `rounded-lg` or `transition-all` added to a staff component fails `npm run lint`; the same class in `components/landing/` does not, verifies **AC-17**
- Settings, reports, users, account: eyebrow, title, lede, section cards with icon chips, no scroll motion, verifies **AC-12**
- Sign in: centred card, `ink` submit, glass header, verifies **AC-13**, **AC-4**

## Build plan

Ordered as a Tracer Bullet. Tasks 0 to 3 are the thin real thread: the landing's baseline is pinned, the recipes exist, and one real screen, the staff board, wears the new header, card and tiles end to end with the landing proven untouched. Every later task thickens a part of that path.

0. [x] Commit the landing work currently uncommitted in the working tree, so the frozen baseline is a commit. Take the baseline screenshots of `/` at 375 and 1280 pixels and with the checkout card open, with a fixed clock and the live tiles masked, and store them with the test, satisfies **AC-1**
1. [x] Add the five utilities, `--curve-drawer` and `--dur-sheet` to `app/globals.css` (new rules only; no existing line changes), the `ink` variant to `Button`, and the lint rule to `eslint.config.mjs`, then fix what it flags, satisfies **AC-2**, **AC-17**
2. [x] Restyle `AppShell` into the glass header with the `[data-shell-header]` scroll edge, staff pill links, `max-w-6xl`, the `muted` page option, and the `toolbar` prop removed; delete `StaffToolbar` and `PublicToolbar`, seating their contents above the grid until task 3's card takes them, satisfies **AC-3**, **AC-4**
3. [x] Build `BoardCard` and restyle `ScheduleCell`, `ScheduleGrid` and `StateLegend` to the landing tile, gap and legend, with loading, error, empty and closed states inside the card, on both boards; run the landing compare, satisfies **AC-5**, **AC-6**, **AC-7**, **AC-1**
4. [x] Build `DayStrip`, place `DatePicker` at its end, wire the spec 0014 signals to it on both boards, and retire `DayNav` from them, satisfies **AC-8**
5. [x] Restyle `LiveIndicator` as the landing pill, shown on `/design` only, and seat the online checks chip on staff in the card's header row, satisfies **AC-9**, **AC-5**
6. [x] Replace `SelectionBar` with `SummaryCard`: the wide aside and the floating phone card with its enter and exit, satisfies **AC-10**
7. [x] Restyle `components/ui/sheet.tsx` and `BoardSheet` into the floating inset sheet with the soft overlay, the drawer curve, the icon header and `h-12` footer buttons, and give each sheet its icon, satisfies **AC-11**
8. [x] Build `PageHeading` and `SectionCard`, and move settings, reports (charts and tooltip included), staff accounts and your account onto them, satisfies **AC-12**
9. [x] Move sign in, sign up and reset onto the centred card with an `ink` submit, restyle `BoardNotice`, move `app/not-found.tsx` onto `AppShell` with its card, and check the legal pages, `/design` and the error page under the new header, satisfies **AC-13**, **AC-4**
10. [x] Motion pass with the `animate` and `emil-design-eng` checklists: named transitions only, durations from the tokens, no keyboard animation, reduced motion and reduced transparency on every moving or glass piece, satisfies **AC-14**
11. [x] Phone and zoom pass in a real browser at 375 by 667 and at 200 percent on both boards; tighten padding and gutters until seven rows show, satisfies **AC-15**
12. [x] Update `/design`: the recipes, the `ink` button, the board card, the strip, the pill readings, every tile view, a floating sheet, `PageHeading`, `SectionCard`, and the contrast list of AC-16, satisfies **AC-16**, **AC-18**
13. [x] Rewrite `docs/design.md` for the new character, recipes, motion budget, yellow rule, frozen landing rule, component inventory and light only text, satisfies **AC-18**
14. [x] Final pass: the landing screenshot compare and the `git diff` check again, then `npm run check`, satisfies **AC-1**
15. [x] Move the focus look on shared controls to ink (fields: ink edge and 10 percent halo; buttons, checkboxes, switches, badges, the calendar day: a 2px ink ring with a 2px gap), pin the toaster to light with a token description colour, hold the landing compare's masked parts at a fixed height, and retake the baseline, satisfies **AC-1**
16. [x] Swap the control focus ring for an outline with a see through 2px offset in `button`, `badge`, `checkbox`, `switch` and the calendar's focused day (no `ring-offset-background`), add the three labelled focus rows to `/design`'s contrast list, update the focus line in `docs/design.md`, and run the landing compare, satisfies **AC-1**, **AC-16**

## Consequences

**Positive**

- One look across the product: a player moving from `/` to `/schedule`, and a staff member moving from the board to settings, never feel the seam.
- The recipes are named once, so the next screen composes the look in a few classes, and `/design` shows them all.
- The yellow band's job (brand) moves to the mark and the landing; yellow on working screens now always means "what you picked" or "the next step", which makes the board easier to read, not harder.
- The landing stays verified exactly as it is, with a screenshot check that catches a shared change leaking into it.

**Negative and tradeoffs**

- The landing's recipes now exist twice: its frozen copies (`press.ts`, its own strip, its CSS rules) and the shared ones. They can drift. Accepted to keep the landing frozen; the second item under Follow-up retires the copies when you next touch the landing.
- Softer tile borders lean harder on the icon and the word. In heavy glare a Booked tile next to an Unavailable one is told apart by icon, word and fill, not by a strong edge.
- The side summary card takes 20rem from the grid at 1024px and up, so a venue with many courts scrolls sideways sooner on a laptop.
- The board card and the day strip spend vertical space; seven rows on a small phone hold only because padding tightens below 640px. A future addition to the card's header row must be weighed against AC-15.
- Backdrop blur on the header and the phone card costs some GPU on an older tablet. The reduced transparency fallback exists, but a staff member has to have that setting on.
- A screenshot compare with masked live tiles is more brittle than a unit test; a font or browser update can fail it with no real change, and it needs a fixed clock to be meaningful.
- Staff lose the yellow band they are used to; the first days may feel like a different app.
- The frozen landing now has one deliberate exception (the focus look and the toaster). It is small and invisible at rest, but the screenshot compare cannot catch a focus regression, because nothing in its shots is focused; a focus change on the landing has to be checked by hand.
- An outline offset is see through, so on a busy surface (a tile, a coloured chip) the 2px gap shows that surface rather than a clean white band. Every control in this app sits on white or the plain grey page, so it reads cleanly today.
- Two focus styles live side by side: ink on controls, the global amber outline on tiles, the day strip and links. Each is clean on its own, but a keyboard user sees two colours.
- With no live pill on either board, a staff member gets no on screen sign that the realtime channel has dropped. The slow poll while the channel is down (spec 0006, AC-6) still keeps the board close to current, but a stale board is now silent.

**Neutral**

- `DayNav` stays in the codebase for `/design` and any future use, but no board renders it.
- `SettingsSection` and `SelectionBar` are replaced, not kept beside their successors.
- `/booking` (the lookup page) is not on `AppShell` and is out of scope; it already wears the landing header.
- Spec 0003 keeps its grid, state vocabulary, keyboard and accessibility contract; this spec amends its character, its AC-4 for tiles, its `AppShell` description and its colour roles for the band. Spec 0014's AC-2 signals are restated for the strip.

## Follow-up

- [ ] `emil-design-eng`, `animate` and `apple-design` shaped this design and spec 0013's, but are not in root `AGENTS.md` `## Agent skills`. They are project wide UI conventions and belong at root level.
- [ ] When the landing is next opened for work, point it at the shared recipes (`press`, `DayStrip`, the utilities) and delete its copies, so the look lives in one place. That is a landing change, so it needs its own decision to unfreeze it.
- [ ] Spec 0005 AC-3 describes the selection bar and spec 0006 describes the public toolbar with `DayNav`; a `/sync` pass should point both at this spec.
- [ ] Spec 0003's Follow-up about `docs/design.md` still describing a dark theme is closed by AC-18 here; tick it there when this ships.
- [ ] Consider an automated contrast test for the AC-16 pairs, so AA is a test rather than a look on `/design`. Route it through `/test`.
- [ ] Consider a focused state shot in `e2e/landing-frozen.spec.ts` (a field and a button with keyboard focus), so the one landing exception AC-1 allows is guarded like the rest of the page.
- [ ] Decide whether tiles, the day strip and links move to ink focus too, for one focus colour everywhere. That changes the global `:focus-visible` rule the landing uses, so it needs its own amendment to AC-1.
- [ ] If a board ever takes the live pill back, AC-9 and AC-5 here change first; the component and its `/design` preview are ready.
