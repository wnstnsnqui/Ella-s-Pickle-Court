# The design system

_The written half of spec [0003](specs/0003-design-system-ui-foundation/index.md). The values
themselves live in [`app/globals.css`](../app/globals.css), which is the source of truth: this file
explains them, it never repeats them. If the two ever disagree, the CSS is right and this file is
out of date._

Everything on screen here is the same object: a grid with time down the side, a column per court,
and each cell reading Booked, Available or Unavailable. The system exists so every screen composes
that rather than reinventing it.

You can see the whole thing running at **`/design`**, which renders every token, every component and
every cell state in both themes, and measures the contrast of every pair live in your browser. When
you change a token, look there first.

## Character

A clean utility board. A near neutral canvas, one typeface, and almost no colour anywhere except the
cells, so the one thing a reader came for is the one thing that is coloured. It is meant to be read
in a hurry: by a player squinting at a phone in daylight, and by a staff member glancing at a tablet
between rallies.

## Build mandate

- **Name a token, never a value.** Every colour, radius, row height and duration is in
  `app/globals.css`. A raw colour in a component is a defect, and `npm run lint` fails on it.
- **Never name a theme.** Dark follows the device setting through a media query, and the semantic
  token carries both halves, so a component has nothing to say about which one is on. `dark:` colour
  overrides are a lint error too. `/design` is the single exception, and only because showing both at
  once is its whole job.
- **Colour is never the only signal.** Every state carries an icon and a name a screen reader reads.
- **Focus is never removed.** `:focus-visible` only, always visible, never `outline: none` without a
  replacement.
- **The shell renders on the server.** Only the interactive cell layer and the realtime subscription
  are client components, so the first paint is a real board.
- **Motion is optional.** Every animation sits inside a `prefers-reduced-motion` guard, and the guard
  keeps the information while dropping the movement.

## Type

Inter, and nothing else. It is self hosted through `next/font`, downloaded at build time and served
from our own origin, so no visitor's address ever reaches a font host.

Six steps, and nothing in this project sets a font size any other way. Each is a Tailwind utility
that carries its size, line height and weight together, so you cannot take one without the others:

| Utility        | Used for                                                     |
| -------------- | ------------------------------------------------------------ |
| `text-display` | The one page title                                            |
| `text-title`   | Section headings, the wordmark                                |
| `text-body`    | Paragraphs, descriptions, the default on `<body>`             |
| `text-label`   | Field labels, court names, day navigation                     |
| `text-cell`    | Inside a schedule cell, tabular                               |
| `text-caption` | Legend, hints, footnotes, the time column                     |

Anything showing a time or a number uses `tabular-nums`, so the time column never changes width as
the day scrolls under it.

## Colour

Written in OKLCH, a colour space where two colours with the same lightness number actually look
equally light. That is what makes a contrast pair predictable instead of a guess, and it is why the
tokens can be nudged for contrast without the hue drifting.

The palette is defined once per theme as `--light-*` and `--dark-*` pairs. A thin semantic layer
picks which half is in force, and only the semantic names are ever used:

- **Surface**: `--background`, `--foreground`, `--card`, `--muted`, `--muted-foreground`,
  `--accent`, `--secondary`, `--border`, `--input`, `--ring`, `--overlay`.
- **Accent**: `--primary` (ink, a near black, deliberately not a colour), `--destructive`, and each
  one's `-foreground`.
- **State**: five roles the grid owns, each with a fill, a `-fg` and a `-border`:
  `--state-available`, `--state-booked`, `--state-unavailable`, `--state-outofhours`,
  `--state-selected`.

`--border` is the decorative hairline between things. `--input` is the boundary of something you can
actually operate, so it is held to 3:1 and is noticeably stronger. They are not interchangeable.

## Space, radius and geometry

Ordinary spacing uses the Tailwind scale restricted to `1 2 3 4 6 8 12`. Reach for one of those
before inventing a gap.

Four measurements are load bearing enough to be tokens of their own:

| Token              | Why it matters                                                                    |
| ------------------ | --------------------------------------------------------------------------------- |
| `--row-h`          | 2.75rem, which is the 44px minimum touch target a slot row has to clear            |
| `--col-time`       | The pinned time column, and the scroll margin every cell uses so arrow key focus never lands underneath it |
| `--col-court-min`  | The narrowest a court column ever gets before the grid starts scrolling sideways    |
| `--radius-cell`    | Tighter than `--radius`, because a grid of soft rectangles reads as mush            |

Motion is two durations: `--dur-fast` for colour and opacity, `--dur-slow` for the changed cell
highlight and nothing else.

## The state vocabulary

The database knows three states. A reader sees seven, because four of them are things the browser
knows and Postgres has no business storing. `CELL_STATES` in `lib/schedule/constants.ts` stays at
three forever; the seven live in `components/schedule/cell-view.ts` as `CellView`.

| View          | Where it comes from                                   | Icon            |
| ------------- | ----------------------------------------------------- | --------------- |
| Available     | `CellState` from `lib/schedule/grid.ts`               | `circle-check`  |
| Booked        | `CellState`                                            | `calendar-check`|
| Unavailable   | `CellState`                                            | `ban`           |
| Out of hours  | `GridRow.outOfHours`, a row flag over a real state      | `moon`          |
| Selected      | Browser state only                                     | `circle-dot`    |
| Saving        | A Server Action in flight                              | `loader-circle` |
| Failed        | A Server Action that was refused                       | `triangle-alert`|

Precedence, most urgent outward: failed, saving, selected, out of hours, then the derived state.
`cellViewFor` is the only place that decides it.

## The components

| Component        | Kind   | What it is for                                                          |
| ---------------- | ------ | ------------------------------------------------------------------------ |
| `AppShell`       | server | The wordmark, the toolbar slot, and a staff slot gated by Clerk           |
| `Wordmark`       | server | The venue mark, set in type. There are no image assets in this project    |
| `DayNav`         | client | Pushes `?date=YYYY-MM-DD`. Holds no state of its own                      |
| `LiveIndicator`  | client | Live, reconnecting, or not live with the age of the data                  |
| `ScheduleGrid`   | client | The grid, plus its loading, empty and error states, from one `GridView`   |
| `ScheduleCell`   | client | One hour on one court, in one of the seven views                          |
| `StateLegend`    | server | What the icons mean, always on the page                                   |
| `GridSkeleton`   | server | The grid's shape while another day is on its way                          |
| `EmptyState`     | server | No courts, or closed all day                                              |
| `ErrorState`     | client | The read failed, with a retry                                             |
| Button, Input, Select, Sheet, Dialog, Toast, Skeleton, Badge, Separator, Alert, Empty | mixed | shadcn/ui, in `components/ui/`. The source is ours; the accessible behaviour is proven |

`ScheduleGrid` takes exactly one input, a `GridView` union, so it cannot be asked to render a state
it has no data for. There is no way to be loading and hold rows at the same time.

## Accessibility

The bar is WCAG 2.2 AA, and `/design` measures the colour half of it rather than asserting it.

- **Contrast**: 4.5:1 for body text; 3:1 for large text, icons, focus rings, and the boundary of
  anything you can operate. Every pair is listed and measured on `/design`, in both themes.
- **The grid is one tab stop.** Arrow keys move between cells, Home and End move within a row, Page
  Up and Page Down move a screenful, and the focused cell always shows a ring. It follows the ARIA
  grid pattern: `role="grid"`, `role="row"`, `role="rowheader"`, `role="columnheader"`,
  `role="gridcell"`, with a roving tabindex.
- **The focus ring is inset** on a cell, because the time column is sticky and would otherwise clip
  a ring drawn outside it.
- **Every state has a name**, built from the cell's own contents: "Court 1 at 9am. Booked."
- **Rows are at least 44px** and the grid scrolls sideways rather than shrinking below
  `--col-court-min`, so a target never gets too small to hit.
- **Reduced motion keeps the information.** A changed cell stops fading and holds a steady ring
  instead.
- **Live regions are polite**, because a board that updated is not an interruption. An error is
  `role="alert"`, because acting on a board that never loaded is worse.

## Do's and don'ts

**Do**

- Compose from the components above before writing markup.
- Use `cn()` for conditional classes, and `cva` when a component has real variants.
- Put layout classes on a component from the outside; leave its colours and type alone.
- Give a new colour a token, in both themes, and check it on `/design` before using it.

**Don't**

- Don't write a Tailwind palette colour (`bg-blue-500`, `text-white`). Lint will stop you.
- Don't write a `dark:` colour pair. Lint will stop you there too.
- Don't add a state to `CELL_STATES`. Browser state belongs in `CellView`.
- Don't cache a board. A page whose value is being current renders per request.
- Don't reach for an image. The mark, the favicon and the social card are all generated from type.
