# The design system

_The written half of specs [0003](specs/0003-design-system-ui-foundation/index.md) and
[0018](specs/0018-landing-look-everywhere/index.md). The values themselves live in
[`app/globals.css`](../app/globals.css), which is the source of truth: this file explains them, it
never repeats them. If the two ever disagree, the CSS is right and this file is out of date._

Everything a staff member or a player works with is the same object: a grid with time down the side,
a column per court, and each cell reading Booked, Available or Unavailable. The system exists so
every screen composes that rather than reinventing it.

You can see the whole thing running at **`/design`**: every token, every recipe, every tile view,
the board card, a floating sheet, the page parts, and the contrast of every pair measured live in
your browser. When you change a token or a recipe, look there first.

## Character

**The landing page's look, at a working tempo.** The landing page at `/` set the look: soft round
white cards with a hairline ring on a stone grey page, a glass header the page scrolls under, a dark
ink button for the one thing to do next, yellow saved for what you picked, roomy tiles with a bold
icon beside a word, and buttons that give a little when pressed. Every other screen wears the same
materials, so a player moving from `/` to `/schedule`, or a staff member moving from the board to
settings, never feels a seam.

A working screen borrows the materials and the small motions, never the marketing ones. A staff
member sees the board tens of times a shift, between rallies, sometimes in glare. So nothing reveals
on scroll, nothing arrives in a cascade, nothing lifts on hover, and every motion is short enough to
be almost invisible.

The palette is the shadcn preset [`bQEdqZEKm`](https://ui.shadcn.com/create?preset=bQEdqZEKm): style
maia, stone neutrals, a yellow theme, Phosphor icons, and Outfit for all type. Teal for a free hour
and tangerine for a taken one stay, because they are the grid's meaning rather than decoration.

**Light only.** There is no dark palette and no theme toggle. `dark:` is pinned to a class nothing
ever sets, so a component added later from the registry keeps its light styles on a phone in dark
mode.

## Build mandate

- **The landing page is frozen and is the reference** (spec 0018, AC-1). No file under
  `components/landing/` or `app/(landing)/` changes, the landing rules in `app/globals.css` stay byte
  identical, and every shared module the landing imports keeps its defaults: `components/ui/button`,
  `dialog`, `form`, `input`, `label`, `checkbox`, `skeleton`, `components/wordmark`,
  `components/staff/confirm-dialog`, `components/receipt/`, and every existing token value. Anything
  new is opt in: a variant, a utility, a token, a component. A staff form gets the new look by
  styling its fields where it uses them, never by changing `form.tsx` or `input.tsx`. The one
  amended exception (AC-1, 2026-10-05) is the ink focus look on the shared controls and the toaster
  pinned to light; anything more needs its own amendment first.
  `e2e/landing-frozen.spec.ts` compares `/` and the open checkout card against screenshots taken
  before the look spread; run `npx playwright test` after any shared change.
- **Name a recipe, never copy it.** A material (press, card, glass, float, icon chip) is a utility in
  `app/globals.css`. A component names the utility; it never carries a copy of its class string. The
  landing's own copies (`PRESS` in `components/landing/press.ts`, its inline classes) are the one
  exception, and they are frozen.
- **Name a token, never a value.** Every colour, radius, row height and duration is in
  `app/globals.css`. A raw colour in a component is a defect, and `npm run lint` fails on it.
- **Yellow means picked or next** (see the yellow rule below).
- **Colour is never the only signal.** Every state carries an icon and a word a screen reader reads.
- **Focus is never removed.** `:focus-visible` only, always visible, never `outline: none` without a
  replacement.
- **The shell renders on the server.** Only the interactive layers (the grid, the strip, the summary,
  the sheets) are client components, so the first paint is a real page.
- **Motion is optional** and stays inside the motion budget below.

## The recipes

Each is a Tailwind 4 `@utility` in `app/globals.css`, so it works the same in a server file or a
client file and composes with any other class.

| Recipe            | What it is                                                                      | Reach for it on                                                    |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `press`           | Scale 0.97 on press; transitions `scale`, `translate`, `background-color` and `color` only, 150ms on `--curve-out` | Every button on a working screen                                   |
| `surface-card`    | The card fill, a `ring-1` hairline in `--border`, `rounded-3xl`, `shadow-sm`       | The board card, the summary card, every section, the sign in card  |
| `surface-glass`   | The background at 80 percent with a backdrop blur and saturate; solid under `prefers-reduced-transparency` | The header, the summary card floating on a phone                   |
| `elevation-float` | The hero board's deep shadow tinted from `--foreground`, and its faint ring        | Floating sheets, the summary card floating on a phone              |
| `chip-icon`       | A `size-11` `rounded-2xl` muted square that holds a duotone icon at `size-6`       | Sheet headers, section headers                                     |

**`ink`** is a `Button` variant, not a utility: the `--mark` fill with `--mark-foreground` text. It
is the one main action on a page surface (Book on the summary card, Save in settings, Sign in, Create
account, Set password, Make a link).

**`press` is applied for you** on every button inside `AppShell` and inside a `BoardSheet`, through
one descendant rule (`[&_[data-slot=button]]:press`). `cn()` knows `press` sets the transition, so
`press` passed straight to a `Button` replaces its own `transition-all` instead of fighting it.

Two tokens exist only for the sheets: `--curve-drawer` (the iOS drawer curve, exposed as
`ease-drawer`) and `--dur-sheet` (300ms).

## The yellow rule

On every working screen, yellow (`--brand`, `--primary`, `--accent`) appears only on:

- a Selected tile,
- the default (yellow) button for a step inside a sheet or a dialog,
- a hovered menu row,
- the mark's letter,
- the report charts' ramp.

The one main action on a page surface is `ink`. Secondary actions are `outline` or `ghost`. A chosen
option (a report range, a strip day) reads in ink or on a white highlight, never in yellow. There is
no yellow header band any more; the brand lives in the mark and on the landing page.

## Motion budget

Motion on a working screen is limited to:

- `press` on buttons and on pressable tiles (tiles press to 0.96),
- the day strip's highlight sliding to the chosen day (250ms, `--curve-in-out`),
- a sheet entering (`--dur-sheet` on `--curve-drawer`) and leaving the same way, faster (`--dur-step`),
- the summary card floating in on a phone (rise 8px and fade over `--dur-step`) and out (`--dur-fast`),
- the live pill's ping, where a pill is shown,
- the existing grid dim during a day switch, the changed cell highlight, and spinners.

Nothing reveals on scroll, cascades, lifts on hover, or uses fluid type. Hover changes only colour or
an edge, and only for a pointer that can hover (a tile's edge firms up for a fine pointer only).
Arrow key moves inside the grid never animate: the outline is never transitioned.

Every transition names its properties. Outside `components/ui/` and the frozen landing files,
`transition-all` is a lint error, and so are `rounded-md` and `rounded-lg` (the old face's radii):
see AC-17 in `eslint.config.mjs`.

**Reduced motion** stops movement and keeps fades: the strip's highlight jumps, sheets and the
floating summary only fade, the ping stops, and a changed cell holds a steady ring instead of a
fading one. **Reduced transparency** makes every glass surface solid.

## Type

Outfit, and nothing else: `font-sans` on `<body>`, and `font-heading` (applied to `h1` to `h6` in the
base layer and used by the shadcn titles) points at the same face. It is self hosted through
`next/font`, downloaded at build time and served from our own origin, so no visitor's address ever
reaches a font host.

Six steps on a working screen, plus two marketing steps that only the landing page uses. Nothing sets
a font size any other way. Each utility carries its size, line height and weight together:

| Utility         | Used for                                                                  |
| --------------- | ------------------------------------------------------------------------- |
| `text-hero`     | The landing page's one headline, fluid with the viewport (landing only)    |
| `text-headline` | Landing page section headings, fluid with the viewport (landing only)      |
| `text-display`  | A working page's one title, in `PageHeading`                               |
| `text-title`    | Section and sheet titles, the board's day heading, the wordmark             |
| `text-body`     | Paragraphs, descriptions, the default on `<body>`                           |
| `text-label`    | Field labels, court names, the header pills, eyebrows                       |
| `text-cell`     | Inside a tile, tabular                                                     |
| `text-caption`  | Legend, hints, footnotes, the time column, sheet descriptions              |

An eyebrow is `text-label`, `--link`, uppercase, with wide tracking. Anything showing a time or a
number uses `tabular-nums`, so the time column never changes width as the day scrolls under it.

## Colour

Written in OKLCH, a colour space where two colours with the same lightness number actually look
equally light. That is what makes a contrast pair predictable instead of a guess, and it is why a
token can be nudged for contrast without its hue drifting. Only the semantic names are ever used:

- **Surface**: `--background`, `--foreground`, `--card`, `--muted` (the stone grey page behind
  cards), `--muted-foreground`, `--accent`, `--secondary`, `--border`, `--input`, `--ring`,
  `--overlay`, `--overlay-soft` (the checkout card's dim, which every board sheet now uses too).
- **Accent**: `--primary` (the preset yellow a step button wears), `--link` (deep amber, for anything
  that reads as a link or accent text, because yellow on white lands near 1.5:1), `--brand` (the
  brand yellow the landing uses), `--mark` (the ink: the mark's badge and the `ink` button),
  `--destructive`, and each one's `-foreground`.
- **Charts**: `--chart-1` to `--chart-5`, the preset's yellow ramp from lightest to darkest. Charts
  and the heatmap use these, never `--primary`.
- **State**: five roles the grid owns, each with a fill, a `-fg` and a `-border`:
  `--state-available`, `--state-booked`, `--state-unavailable`, `--state-outofhours`,
  `--state-selected`.

`--border` is the decorative hairline between things. `--input` is the boundary of something you can
actually operate, so it is held to 3:1 and is noticeably stronger. They are not interchangeable.

## Space, radius and geometry

Ordinary spacing uses the Tailwind scale restricted to `1 2 3 4 6 8 12`, plus `1.5` (6px) for the
gap between tiles. Reach for one of those before inventing a gap.

Surfaces are round: `rounded-3xl` for cards and sheets, `rounded-2xl` for panels inside them and
icon chips, `rounded-full` for pills and round buttons, `rounded-cell` for a tile. The content column
is `max-w-6xl`, as on the landing page.

Four measurements are load bearing enough to be tokens of their own:

| Token             | Why it matters                                                                     |
| ----------------- | ---------------------------------------------------------------------------------- |
| `--row-h`         | 3rem (48px), above the 44px minimum touch target a slot row has to clear            |
| `--col-time`      | The pinned time column, and the scroll margin every cell uses so arrow key focus never lands underneath it |
| `--col-court-min` | The narrowest a court column ever gets before the grid starts scrolling sideways   |
| `--radius-cell`   | Tighter than a card, because a grid of very soft rectangles reads as mush          |

**Seven rows on a small phone** (spec 0003 AC-7, spec 0018 AC-15). On a 375 by 667 screen at least
seven full rows show below the header, the card's heading, the strip and the legend. Below 640px the
page gutter is 8px (`BOARD_PAGE` in `components/board-card.tsx`), the card's padding and inner gaps
are 12px and 8px, a strip day is 48px tall, and the legend is one row that scrolls sideways. A new
thing in the board card's header row has to be weighed against this budget.

## The board

Both boards, `/staff` and `/schedule`, sit in one `BoardCard` on the muted page, as the landing's
booking card does. Inside it, top to bottom:

1. **The day heading** (`text-title`, tabular; "Today, " in muted text on venue today, "· past"
   after a past day), with the online checks chip on its right on staff.
2. **The day strip** (`DayStrip`) with the calendar (`DatePicker`) at its end. Each day is a native
   radio. Below 1024px it is one row the thumb scrolls sideways; from 1024px it pages a week at a
   time with round arrows and one highlight slides to the chosen day.
3. **The legend**: each view's bold icon beside its word in muted caption type, no swatches.
4. **The grid.**

Loading, error, no courts and closed all day all render inside the same card. Closed all day is the
landing's closed panel (`ClosedDayPanel`): a quiet centred line on the muted fill, with any staff
action.

On a day switch the strip's highlight and the heading name the target day at once, the grid dims with
`aria-busy` until it lands, and a failed read snaps both back with the toast (spec 0014, AC-2).

**The tiles** take the landing's look and keep every contract of spec 0003. The icon (bold) and a
word sit side by side: with two courts or fewer the word always shows; with more it shows from 640px.
On the staff board a Booked tile shows the customer's name in place of the word, at every width.
Available has a soft edge that firms up under a fine pointer; Booked, Unavailable, Outside opening
hours and Saving have no visible edge; Selected is outlined and lifted; Change refused is unchanged.

**The staff selection** is the landing's summary card (`SummaryCard`): beside the grid from 1024px,
staying in place with a muted line when nothing is picked; floating over the grid below that, only
while something is picked.

**The live pill** (`LiveIndicator`) is restyled as the landing's pill but is shown on no board today,
by the engineer's choice; `/design` shows its three readings.

## The state vocabulary

The database knows three states. A reader sees seven, because four of them are things the browser
knows and Postgres has no business storing. `CELL_STATES` in `lib/schedule/constants.ts` stays at
three forever; the seven live in `components/schedule/cell-view.ts` as `CellView`.

| View                   | Where it comes from                                | Icon (Phosphor)  |
| ---------------------- | -------------------------------------------------- | ---------------- |
| Available              | `CellState` from `lib/schedule/grid.ts`            | `check-circle`   |
| Booked                 | `CellState`                                        | `calendar-check` |
| Unavailable            | `CellState`                                        | `prohibit`       |
| Outside opening hours  | `GridRow.outOfHours`, a row flag over a real state  | `moon`           |
| Selected               | Browser state only                                 | `record`         |
| Saving                 | A Server Action in flight                          | `spinner`        |
| Change refused         | A Server Action that was refused                   | `warning`        |

Precedence, most urgent outward: refused, saving, selected, outside opening hours, then the derived
state. `cellViewFor` is the only place that decides it.

## The components

| Component         | Kind   | What it is for                                                                          |
| ----------------- | ------ | --------------------------------------------------------------------------------------- |
| `AppShell`        | server | The glass header with the mark and, signed in, the staff pills (`NavMenu` below 1024px); `muted` for the grey page |
| `Wordmark`        | server | The venue mark, set in type. There are no image assets in this project (frozen)          |
| `BoardCard`       | server | The white card a board sits in; `BOARD_PAGE` is a board page's gutter                    |
| `BoardDayHeader`  | client | The day heading, the strip and the calendar, with the day switch signals                 |
| `DayStrip`        | client | The days from venue today to the booking horizon, as native radios                       |
| `DatePicker`      | client | The calendar at the strip's end; a popover from 768px, a sheet below                     |
| `ScheduleGrid`    | client | The grid, plus its loading, empty and error states, from one `GridView`                  |
| `ScheduleCell`    | client | One hour on one court, in one of the seven views, with `roomy` for the word              |
| `StateLegend`     | server | What the icons mean, always on the page                                                  |
| `ClosedDayPanel`  | server | Closed all day, with any staff action                                                    |
| `SummaryCard`     | client | The staff selection, as an aside (`layout="aside"`) or floating (`layout="floating"`)    |
| `BoardSheet`      | client | Every board sheet: floating, inset 8px, with a required `icon` for its header            |
| `PageHeading`     | server | A working page's eyebrow, title and lede, with the "Back to the board" pill             |
| `SectionCard`     | server | One section of a working page: icon chip, title, caption, action, then hairline rows     |
| `NoticeCard`      | server | One message on a page of its own: `BoardNotice`, the not found page, the error page      |
| `LiveIndicator`   | client | Live, reconnecting, or not live with the age of the data (shown on `/design` only)       |
| `GridSkeleton`, `BoardPageSkeleton`, `SectionCardSkeleton` | server | The shapes while a page streams in                    |
| `EmptyState`      | server | No courts, or closed all day, on the muted fill                                          |
| `ErrorState`      | client | The read failed, with a retry                                                            |
| `DayNav`          | client | The old day arrows, retired from both boards and kept for `/design` and any future use   |
| Button, Input, Select, Sheet, Dialog, Toast, Skeleton, Badge, Separator, Alert, Empty | mixed | shadcn/ui, in `components/ui/`. The source is ours; the accessible behaviour is proven |

`ScheduleGrid` takes exactly one input, a `GridView` union, so it cannot be asked to render a state it
has no data for. There is no way to be loading and hold rows at the same time.

A sheet's icon is a constant per sheet: Book `CalendarPlus`, Details `CalendarCheck`, Edit
`PencilSimple`, Close hours `Prohibit`, Closed day `CalendarX`, Court `CourtBasketball`, User
`UserCircle`, the calendar's phone fallback `CalendarDots`, and the two online booking sheets `Globe`.

## Accessibility

The bar is WCAG 2.2 AA, and `/design` measures the colour half of it rather than asserting it.

- **Contrast**: 4.5:1 for text; 3:1 for large text, icons, focus rings, `--input`, and the boundary
  of anything you can operate. A grid tile's edge is no longer held to 3:1 against the page (spec
  0018, AC-16): its icon and word carry the state, so each view's text is held to 4.5:1 on the tile's
  own fill instead. The header's text is measured on the glass at its worst, composited over
  `--mark`, the darkest thing that can scroll under it; that is why the header pills use
  `--foreground`, never `--muted-foreground`. Every pair is listed and measured on `/design`.
- **The grid is one tab stop.** Arrow keys move between cells, Home and End move within a row, Page
  Up and Page Down move a screenful, and the focused cell always shows a ring. It follows the ARIA
  grid pattern: `role="grid"`, `role="row"`, `role="rowheader"`, `role="columnheader"`,
  `role="gridcell"`, with a roving tabindex.
- **Focus is ink on controls.** A field, select or textarea takes an ink edge with a faint ink halo;
  a button, checkbox, switch, badge or the calendar's focused day takes a crisp 2px ink outline with
  a 2px see through gap (`outline-offset`, never a painted `ring-offset`), so it shows on the ink
  button too and the gap matches whatever sits behind, white card or grey page alike (a destructive
  button's outline is `--destructive`). Write it as `focus-visible:outline-2 outline-offset-2
  outline-solid outline-foreground`; the `outline-solid` matters, because a control's own
  `outline-none` would otherwise keep the outline hidden. Both live in the `components/ui/`
  primitives, and a hand built control (a list row, a radio card) uses the same classes. Everything
  else (tiles, the day strip, links) keeps the global amber `:focus-visible` outline. The ink pairs
  on the page, a card and the muted page are measured on `/design` at 3:1.
- **The focus ring is inset** on a cell, because the time column is sticky and would otherwise clip a
  ring drawn outside it.
- **Every state has a name**, built from the cell's own contents: "Court 1 at 9am. Booked."
- **The day strip is native radios**, named "Today, Tue 29 Sep" or "Wed 30 Sep", with ". Closed" on
  a weekday the venue does not open.
- **Rows are at least 44px**, and main and step buttons are `h-12`. The grid scrolls sideways rather
  than shrinking below `--col-court-min`, so a target never gets too small to hit.
- **Sheets trap focus**, close on Escape, scroll inside themselves, and return focus to whatever
  opened them.
- **Live regions are polite**, because a board that updated is not an interruption. An error is
  `role="alert"`, because acting on a board that never loaded is worse.

## Do's and don'ts

**Do**

- Compose from the components above, and the recipes, before writing markup.
- Use `cn()` from `@/lib/utils` for conditional classes, and `cva` when a component has real variants.
- Put layout classes on a component from the outside; leave its colours and type alone.
- Give a new colour a token, and check it on `/design` before using it.
- Pass an explicit radius (`rounded-3xl`) beside `surface-card` when the element's own component
  sets one, so `cn()` drops the old radius instead of leaving the two to fight.

**Don't**

- Don't touch the landing's files or redefault anything it imports. Add an opt in instead.
- Don't copy a recipe's classes. Name the recipe.
- Don't put yellow on a page surface beyond the yellow rule.
- Don't write a Tailwind palette colour (`bg-blue-500`, `text-white`), a `dark:` pair,
  `transition-all`, `rounded-md` or `rounded-lg` outside `components/ui/`. Lint will stop you.
- Don't reveal, cascade or lift anything on a working screen.
- Don't add a state to `CELL_STATES`. Browser state belongs in `CellView`.
- Don't cache a board. A page whose value is being current renders per request.
- Don't reach for an image. The mark, the favicon and the social card are all generated from type.
