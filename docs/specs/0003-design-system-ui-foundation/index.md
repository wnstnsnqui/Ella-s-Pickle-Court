# 0003. Design system and UI foundation for the schedule boards

**Date**: 2026-09-09
**Status**: Accepted

> _Amended 2026-10-04 by [spec 0018](../0018-landing-look-everywhere/index.md): every `AppShell` screen and both boards take the landing page's look (glass header in place of the yellow band, `surface-card` recipes, the landing's tiles, legend, day strip and live pill, floating sheets). AC-4 no longer holds grid tile borders to 3:1 (spec 0018 AC-16); the character, colour roles for the band and the `AppShell` description below are superseded where they differ. The grid's keyboard, ARIA, state vocabulary, phone and accessibility contract here is unchanged._

## Summary

Every screen in this product is the same grid: time down the side, a column per court, each cell reading Booked, Available or Unavailable. This spec settles the visual language that grid is built from, and ships the components that carry it. The look is the shadcn maia preset (a clean white canvas, stone greys, a sunny yellow header band and buttons, deep amber wherever yellow would be too pale to read, Outfit throughout, Phosphor icons, the cell states in teal and tangerine), states are told apart by an icon as well as a color, and interactive pieces come from shadcn/ui so the accessible behaviour is not hand rolled. The board is light only. Tokens in `app/globals.css` are the one source of truth, `docs/design.md` explains them for a person, and a `/design` page shows every component and state and measures every contrast pair live, so a contrast failure is something you can see rather than something you hope about.

## Requirements

**User stories**

- As a player standing outdoors in daylight, I want to tell Booked from Available at a glance on my phone, so that I know whether to drive over.
- As a player who does not see color the way most people do, I want each state to carry a shape as well as a color, so that the board still works for me.
- As a staff member working a tablet all day, I want cells large enough to hit and a keyboard that moves through the grid quickly, so that keeping the schedule current is not a chore.
- As a staff member, I want to know when the board has stopped being live, so that I never act on a stale grid.
- As a player whose phone is set to dark mode, I want the board to look the same as everyone else's, so that what I see outdoors matches what staff see at the desk.
- As the engineer building features 5 to 7, I want the tokens and components to already exist, so that each screen composes rather than invents.

**Acceptance criteria** (the contract, each independently checkable)

- **AC-1**: Color, type, spacing, radius, elevation and motion exist once as tokens in `app/globals.css`. No component carries a raw color value. The system is light only: one set of values, no dark palette and no theme toggle, so a device in dark mode still gets the light board and there is no theme to flash on first paint. _Revised 2026-09-26, see the rationale file._
- **AC-2**: `docs/design.md` documents the type scale, the color roles, the spacing subset, the state vocabulary, the component inventory and the accessibility rules, and names the tokens in `app/globals.css` as the source of truth.
- **AC-3**: A `/design` route renders every token, every base component and every cell state on one page, works without signing in, and is excluded from search indexing.
- **AC-4**: Every text and icon pair meets WCAG 2.2 AA: 4.5:1 for body text, 3:1 for large text, icons, focus rings and component boundaries. Verified on `/design`.
- **AC-5**: Each of Available, Booked, Unavailable, Out of hours, Selected, Saving and Failed has a distinct Phosphor icon, a distinct color pair, and an accessible name a screen reader announces. All seven stay distinguishable with color removed.
- **AC-6**: A legend mapping every icon to its word is present on both the public and the staff board, not hidden behind a tap, and fits in one compact row so it does not eat the visible hours AC-7 requires.
- **AC-7**: On a phone the grid scrolls sideways with the time column pinned to the left, rows are at least 44px tall, and at least seven full slot rows are visible below the header, the day navigation and the legend on a 375 by 667 viewport. The layout survives 200 percent browser zoom with no content lost or overlapped.
- **AC-8**: The grid is a single tab stop. Arrow keys move between cells, Home and End move within a row, Page Up and Page Down move a screenful, and the focused cell always shows a visible focus ring. Roles follow the ARIA grid pattern.
- **AC-9**: Slot labels read in compact 12 hour form in the venue timezone by the rule in `## Feature design`: `9am` on the hour, `12nn` at noon, `12mn` at midnight, `4:30pm` otherwise. Set in tabular figures so the time column never changes width as the day scrolls.
- **AC-10**: One shell carries the venue wordmark, the day navigation and the live indicator on both boards. Staff only controls render solely when there is a signed in staff session (Better Auth, read through `currentSession()`, spec 0004). _Revised 2026-09-26: this said Clerk, which spec 0004 replaced on 2026-09-19._
- **AC-11**: A cell whose state changed under a reader holds a brief highlight. Under `prefers-reduced-motion: reduce` the animation is skipped and the highlight is still perceivable.
- **AC-12**: When the realtime channel leaves `SUBSCRIBED` the indicator reads reconnecting, and after 3 seconds it reads not live and states how old the data is. A drop that recovers inside that window never shows as not live. The grid stays readable throughout and the indicator returns to live by itself.
- **AC-13**: Loading, empty and error states exist and are used: server rendered first paint by default, a route level skeleton grid on a hard load into the board, an empty state for no courts and for a day the venue is closed, and an error state with a retry. A same route day change, the `DayNav` arrows or the calendar pick, does not use that skeleton; it uses the day switch loading behaviour below instead. _Revised 2026-09-18, see Feature design, "Day switch loading" and the rationale file. Since 2026-09-29 that day change is read in the browser, not by a router navigation, see [spec 0014](../0014-board-day-switch-browser/index.md); the look is unchanged._
- **AC-14**: The interactive components feature 6 needs exist and follow the system: button, input, select, sheet, dialog, toast, skeleton, badge, separator, alert and empty.
- **AC-15**: Outfit is the only typeface, for body text and headings alike, self hosted at build time through `next/font`, so no request reaches a third party font host at runtime. Geist, Inter and Roboto Slab are not loaded. _Revised 2026-09-26, see the rationale file._
- **AC-16**: The system ships no image assets. The wordmark is set in type, the favicon is a generated letter mark, and the social card is generated from text at request time.

## Decision

**Chosen option**: Option 2: A token first system on Tailwind 4, with shadcn/ui supplying the accessible interactive primitives.

Design tokens live once in `app/globals.css` and are exposed to Tailwind through `@theme inline`. Every color a component uses is a semantic token, never a raw value. shadcn/ui copies the source of the dialogs, sheets, selects and toasts into the repo, so the hard accessibility behaviour is proven code you own rather than a runtime dependency or a hand rolled guess. The schedule cell and grid, the pieces no library has, are built on top of those same tokens.

Since 2026-09-25 the components and the palette come from the shadcn preset `bQEdqZEKm` (style `radix-maia`, base color stone, yellow theme, Phosphor icons), applied with `npx shadcn@latest apply --preset bQEdqZEKm`. Outfit replaced the preset's own fonts on 2026-09-26, and any preset color that missed an AC-4 pair is darkened along its own hue. `components.json` records the style, so a component added later with `npx shadcn@latest add` arrives already matching.

**Implementation skills**: `shadcn` (`shadcn/ui`, `.agents/skills/shadcn/`) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`) · `tailwind-4-docs` (`lombiq/tailwind-agent-skills`, `.agents/skills/tailwind-4-docs/`)

## Rationale

The reasoning, the options weighed, and a premise note about building this before the pages that consume it: see [rationale.md](rationale.md).

## Feature design

**Token model** (the entities of a design system; all live in `app/globals.css`, nothing is stored)

| Group   | Tokens                                                                                                                       | Notes                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Surface | `--background`, `--foreground`, `--card`, `--popover`, `--muted`, `--muted-foreground`, `--accent`, `--secondary`, `--border`, `--input`, `--ring`, `--overlay` | The shadcn semantic names, adopted as ours so there is one vocabulary, not two. `--accent` is the preset yellow, so a hovered menu row is yellow with amber text. |
| Accent  | `--primary`, `--primary-foreground`, `--link`, `--brand`, `--brand-foreground`, `--mark`, `--mark-foreground`, `--destructive`, `--destructive-foreground` | Primary is the preset yellow that buttons wear. Yellow can never be text on white, so `--link` (deep amber) carries links and accent text; `text-primary` is never used for text. Brand is the yellow header band. Mark is the letter badge in the wordmark. |
| Chart   | `--chart-1` to `--chart-5`                                                                                                   | The preset's yellow ramp, lightest to darkest. Report charts and the heatmap use these, never `--primary`.            |
| State   | `--state-available`, `--state-booked`, `--state-unavailable`, `--state-outofhours`, `--state-selected`, each with `-fg` and `-border` | Five color roles the grid owns. Saving and Failed reuse `--muted` and `--destructive`.                                |
| Type    | `--font-sans` and `--font-heading`, both Outfit, plus the six step scale below                                               | One family. `--font-heading` stays its own token because the shadcn titles name it; `h1` to `h6` use it too. Tabular figures are a utility, not a token. |
| Space   | `--radius` at `0.625rem` with the preset's scale (`--radius-sm` to `--radius-4xl`, each a multiple of `--radius`), `--radius-cell` at `0.5rem`, `--row-h` at `3rem`, `--col-time` at `3.5rem`, `--col-court-min` at `5.5rem` | The grid's fixed geometry. Ordinary spacing uses the Tailwind scale, restricted to `1 2 3 4 6 8 12`.                  |
| Motion  | `--dur-fast` at `120ms`, `--dur-slow` at `1.2s`                                                                              | Slow is the changed cell highlight. Every transition sits inside a reduced motion guard.                              |

Palette in OKLCH (a color space where equal lightness numbers look equally light, which is what makes a contrast pair predictable). These are the values in force in `app/globals.css`; the CSS is the source of truth and this table is its record. The build may nudge lightness to reach AA but must not change hue.

_Revised on 2026-09-26. The Sunset Club palette (itself chosen on 2026-09-12 over a near neutral first palette) was replaced by the shadcn preset `bQEdqZEKm`, because its yellow theme suits the venue's brand. The dark column is gone: the board had already been light only since 2026-09-18. Four preset values missed an AC-4 pair and were darkened along their own hue (marked below). Every pair was measured again on `/design` after the change: 30 pairs, all at AA._

| Role          | Value                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------- |
| background    | `oklch(1 0 0)`, and `--card` and `--popover` the same                                               |
| foreground    | `oklch(0.147 0.004 49.25)`                                                                          |
| muted / fg    | `oklch(0.97 0.001 106.424)` / `oklch(0.525 0.013 58.071)`, fg darkened from the preset's `0.553`     |
| accent / fg   | `oklch(0.852 0.199 91.936)` / `oklch(0.421 0.095 57.708)`, a hovered row                             |
| secondary / fg| `oklch(0.967 0.001 286.375)` / `oklch(0.21 0.006 285.885)`                                          |
| border        | `oklch(0.923 0.003 48.717)`, decorative                                                             |
| input         | `oklch(0.64 0.012 58)`, the boundary of a control, held to 3:1, darkened from the preset's `0.923`   |
| ring          | `oklch(0.421 0.095 57.708)`, deep amber, so focus shows on white and on the yellow band; the preset's grey `0.709` did not |
| overlay       | `oklch(0 0 0 / 0.8)`, behind dialogs and sheets                                                      |
| primary / fg  | `oklch(0.852 0.199 91.936)` / `oklch(0.421 0.095 57.708)`                                            |
| link          | `oklch(0.421 0.095 57.708)`, links and accent text                                                   |
| brand / fg    | `oklch(0.852 0.199 91.936)` / `oklch(0.147 0.004 49.25)`, the yellow header band                     |
| mark / fg     | `oklch(0.147 0.004 49.25)` / `oklch(0.852 0.199 91.936)`, the letter badge                           |
| chart 1 to 5  | `oklch(0.905 0.182 98.111)`, `oklch(0.795 0.184 86.047)`, `oklch(0.681 0.162 75.834)`, `oklch(0.554 0.135 66.442)`, `oklch(0.476 0.114 61.907)` |
| available     | `oklch(0.937 0.06 182)` on bg, fg `oklch(0.434 0.075 183)`, border `oklch(0.6 0.14 183)`             |
| booked        | `oklch(0.923 0.085 74)` on bg, fg `oklch(0.445 0.121 48)`, border `oklch(0.67 0.19 56)`              |
| unavailable   | `oklch(0.955 0.002 90)` on bg, fg `oklch(0.5 0.013 58)`, border `oklch(0.64 0.012 58)`               |
| out of hours  | `oklch(0.935 0.036 298)` on bg, fg `oklch(0.436 0.147 291)`, border `oklch(0.668 0.126 295)`         |
| selected      | `oklch(0.955 0.085 97)` on bg, fg `oklch(0.421 0.095 57.708)`, border `oklch(0.554 0.135 66.442)` at 2px, the preset's `chart-4` amber, because the lighter `chart-3` missed 3:1 |
| destructive   | `oklch(0.577 0.245 27.325)`, fg `oklch(1 0 0)`                                                       |

Hue roles, so the reasoning survives the numbers: yellow is the venue's colour (the header band, the mark, buttons and hovered rows), with deep amber as its readable ink; teal is Available (the colour of a yes), tangerine is Booked, dusk purple is Out of hours, and a pale yellow with an amber border is Selected. Unavailable follows the stone greys. The state borders and `input` are held to 3:1 against the page because a cell and a field are things you operate; `border` is a decorative hairline and is not.

Selected is the one state told apart by a border weight as well as a fill, because it sits on top of whatever state the cell already had and must not hide it.

Type scale, all Outfit: display `1.75rem/2rem 600` · title `1.25rem/1.75rem 600` · body `0.9375rem/1.375rem 400` · label `0.8125rem/1.125rem 500` · cell `0.8125rem/1 600 tabular` · caption `0.75rem/1rem 400`.

**Cell state vocabulary** (the state machine of a cell as a reader sees it)

| View          | Comes from                                              | Icon (Phosphor) | Color role        | Accessible name         |
| ------------- | ------------------------------------------------------- | --------------- | ----------------- | ----------------------- |
| Available     | `CellState` `available` from `lib/schedule/grid.ts`      | `check-circle`  | `--state-available`   | "Available"             |
| Booked        | `CellState` `booked`                                     | `calendar-check`| `--state-booked`      | "Booked"                |
| Unavailable   | `CellState` `unavailable`                                | `prohibit`      | `--state-unavailable` | "Unavailable"           |
| Out of hours  | `GridRow.outOfHours` is true (spec 0002 AC-11)           | `moon`          | `--state-outofhours`  | "Outside opening hours" |
| Selected      | Browser state only, never from the database             | `record`        | `--state-selected`    | "Selected"              |
| Saving        | Browser state while a Server Action is in flight        | `spinner`       | `--muted`             | "Saving"                |
| Failed        | A Server Action returned a conflict or an error         | `warning`       | `--destructive`       | "Change refused"        |

Out of hours is a row flag layered over the three real states, not a fourth. Selected, Saving and Failed are browser state layered over them. `CELL_STATES` in `lib/schedule/constants.ts` stays exactly three values; this vocabulary is a separate `CellView` type in the UI layer, so the database contract from spec 0002 is untouched.

**Component surface**

| Component         | Kind    | Key inputs                                          | States it must render                            | Source          |
| ----------------- | ------- | --------------------------------------------------- | ------------------------------------------------ | --------------- |
| `AppShell`        | server  | `children`, `toolbar`, `staff` slot                 | signed in, signed out                            | new             |
| `LiveIndicator`   | client  | `channelStatus`, `lastUpdatedAt`                    | live, reconnecting, not live with age            | new             |
| `DayNav`          | client  | `date` (the day on screen), `pendingDate`, `onNavigate`, `timezone`, `horizonDays` (was `onNavigatingChange` and its own router, until spec 0014) | today, past, at the booking horizon, navigating (per control) | new             |
| `ScheduleGrid`    | client  | one `view` input, the union below, plus `className` | ready (optionally dimmed by `className`, never a new `GridView` kind), loading, empty, error, 200 percent zoom | new             |
| `ScheduleCell`    | client  | `view: CellView`, `label`, `onSelect`               | the seven views above, focused, disabled          | new             |
| `StateLegend`     | server  | none                                                | fixed                                            | new             |
| `GridSkeleton`    | server  | `rows`, `courts`                                    | fixed                                            | `Skeleton`      |
| `EmptyState`      | server  | `title`, `body`, `action`                           | no courts, closed all day                        | `Empty`         |
| `ErrorState`      | client  | `message`, `onRetry`                                | load failed                                      | `Alert`         |
| Button, Input, Select, Sheet, Dialog, Toast, Badge, Separator | mixed | per shadcn | per shadcn | shadcn/ui |

`ScheduleGrid` takes exactly one *state* input, so it cannot be asked to render a state it has no data for (its other props, `legendViews`, `onSelectCell`, `className` and the rest, are presentation and interaction wiring, not state):

```ts
type GridView =
  | { kind: "ready"; grid: Grid }
  | { kind: "loading" }
  | { kind: "empty"; reason: "no-courts" | "closed" }
  | { kind: "error"; message: string };
```

`LiveIndicator` maps the Supabase channel status onto three readings, with a delay so a blip is not alarming:

| Channel status                            | Reading                             |
| ----------------------------------------- | ----------------------------------- |
| `SUBSCRIBED`                              | live                                |
| `TIMED_OUT`, `CLOSED`, `CHANNEL_ERROR`    | reconnecting for the first 3 seconds, then not live with the age of the data |

The age counts from the last successful server render or realtime message, and the reading returns to live the moment the channel resubscribes.

**Changed cell detection**: a `useChangedCells` hook inside the grid's client layer keeps the previous grid, compares cell by cell on `courtId` plus row start, and holds each changed key in a set for `--dur-slow` before dropping it. Nothing on the server knows or cares about this.

**The selected day** travels as a `?date=YYYY-MM-DD` search parameter, read on the server. A day is then a shareable link, the page still renders per request with nothing cached, and `DayNav` only pushes the parameter. An absent or unparseable value means today at the venue.

_Amended 2026-09-29 by [spec 0014](../0014-board-day-switch-browser/index.md): the parameter is still read on the server for a hard load (first visit, pasted link, reload), but `DayNav` no longer pushes it. A tap reads the new day in the browser through the board's own transport, and the address is updated with `history.replaceState` only once that day lands (no history entry, `date` removed for venue today). The schedule hook also follows a `date` change it did not write, through `useSearchParams`, so a navigation from outside (for example the staff menu's `/staff` link from a dated day) lands the right day. See spec 0014, AC-4 and AC-13._

**Day switch loading** (_superseded in mechanism 2026-09-29 by [spec 0014](../0014-board-day-switch-browser/index.md): the three signals below still hold exactly, spec 0014 AC-2, but they are now driven by the schedule hook's `pendingDate`, not by `useTransition` around `router.push`, and nothing is keyed on the provider any more. A per day `DayBoundary` below the hook gives each landed day a fresh body, and a failed day read snaps back to the day on screen with a toast instead of the "could not be shown" notice. Read spec 0014 for the current mechanism; the next three paragraphs are the 2026-09-18 design, kept for history._) (revised 2026-09-18; replaces the original AC-13 reading of "a skeleton grid while switching day", see the rationale file for why). A day change from inside `DayNav`, an arrow tap or a calendar pick, is a search parameter change on the page already on screen, not a hard route load, so it never reaches the route level `loading.tsx` that shows `GridSkeleton`; that skeleton is for a hard load only (first visit, a pasted link, a full reload). The board still needs to say a day is on its way, so `DayNav` wraps its own `router.push` in `useTransition` and shows three things at once, each scoped to what actually changed:

1. **The control pressed spins**, swapping its icon for a small `spinner` (the Saving icon from the cell state vocabulary above, reused here) with `motion-reduce:animate-none`, per key invariant 7, and carries `aria-disabled` rather than the native `disabled`, so it stays reachable by Tab and does not drop focus the instant it is pressed. The other two controls (the other arrow, the calendar trigger) go `aria-disabled` too, so a second tap cannot fire a second navigation mid flight, but stay on their resting icon rather than spinning, so only the control actually working animates.
2. **The day heading updates immediately**, before the server confirms, using the same `addDays` and `Intl.DateTimeFormat` machinery this spec already names for the confirmed heading, applied to the target date instead of the confirmed one. That target can never be an unreachable day: an arrow's target is one step from an already valid date, and a calendar day beyond the horizon or before today is disabled and cannot be picked in the first place (spec 0011 AC-3), so no separate clamp is needed here.
3. **The grid dims** (`opacity-50`, no pointer events, `motion-reduce:transition-none` per key invariant 7, no minimum delay before it starts and no minimum hold once started, so a very fast response can show a brief flash; accepted rather than adding a debounce that was never observed to be needed) and carries `aria-busy`, but keeps showing the previous day's real rows, never a skeleton and never fabricated content, until the transition settles.

Nothing here can get stuck dimmed. `PublicScheduleProvider` and `StaffScheduleProvider` are keyed on the grid's date, so a successful read mounts a whole new tree already past its dim; a target date the server refuses (before today, beyond the horizon) mounts the existing "could not be shown" notice instead of a board at all, so there is no board left to be dimmed. Either outcome ends the transition and clears every one of the three signals together, never separately.

`DayNav` reports its pending state upward through an optional `onNavigatingChange(pending: boolean)` prop, called from an effect on every change to its own pending flag (including the initial `false` on mount), so a listener sees it flip true the instant a transition starts and false the instant it settles, on any outcome. Each board's schedule context (`PublicScheduleProvider`, `StaffScheduleProvider`) holds it as `dayNavPending` and passes it down as the `className` on `ScheduleGrid` that drives point 3. `DayNav` itself needs no board context to do points 1 and 2, so it still renders standalone on `/design` with the prop simply unset. The live indicator is untouched by any of this: liveness describes the realtime channel, not which day is on screen, so it can keep reading live while the grid is momentarily dimmed underneath it.

**Slot label rule** for AC-9: on the hour reads `9am`, noon reads `12nn`, midnight reads `12mn`; anything else carries its minutes, `4:30pm`. Always the venue timezone, never the reader's.

**Value sourcing**

| Surface        | Value shown                        | Source                                                                                                                  |
| -------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Time column    | compact 12 hour slot label         | New `formatSlotLabel(row.label, timezone)` in `lib/time.ts`, derived from `GridRow.label`, which is `HH:mm` in venue time |
| Cell           | which of the three states          | `GridCell.state` from `lib/schedule/grid.ts`, decided in spec 0002 AC-5                                                  |
| Cell           | out of hours marking               | `GridRow.outOfHours`, decided in spec 0002 AC-11                                                                        |
| Cell           | the accessible name                | The `CellView` to name map in this spec, not from the database                                                          |
| Court header   | court name and order               | `court.name` and `court.sort_order`, spec 0002                                                                          |
| Day navigation | the day being shown                | On a hard load, the `?date=YYYY-MM-DD` search parameter, read on the server (absent or unparseable means today at the venue). After that, the schedule hook's landed day, spec 0014 |
| Day navigation | which days may be picked           | `venue_settings.booking_horizon_days` and `timezone`, spec 0002                                                         |
| Day navigation | which control is mid navigation, and the label shown meanwhile | The schedule hook's `pendingDate` plus the control `DayNav` recorded as pressed (spec 0014; was `useTransition` inside `DayNav`); the label is date arithmetic on the known target date, never a server value |
| Grid           | which cells just changed           | The `useChangedCells` hook comparing the previous grid to the new one on the client. Never a server or database value   |
| Live indicator | live or not live                   | The Supabase realtime channel state on the client, spec 0001 rule 5                                                     |
| Live indicator | how old the data is                | Client clock at the last successful server render or realtime message. Not a database value, so it is never trusted as one |
| Shell          | venue name in the wordmark         | A single exported constant, since `venue_settings` has no name column. Recorded as a Follow-up if that ever changes     |
| Shell          | the header band and mark colours   | `--brand`, `--brand-foreground`, `--mark`, `--mark-foreground` from the palette above, never a raw value. The band's lower edge is the shell's `border-b` in `--border` |
| Shell          | whether staff controls render      | `currentSession()` from `lib/auth/session.ts` (Better Auth, spec 0004), read once per request in `AppShell`. It was Clerk `<Show when="signed-in">` until spec 0004 replaced Clerk |
| Cell           | Saving and Failed                  | The Server Action's own pending and error result, never persisted                                                       |

**Key invariants**

1. **One token layer.** A color, radius, row height or duration appears once, in `app/globals.css`. A raw color in a component is a defect.
2. **No `dark:` color overrides.** The system is light only, so a component never names a theme. `@custom-variant dark` points at a `.dark` class nothing ever sets, so a `dark:` class arriving with a future registry component stays inert instead of following the device.
3. **`CELL_STATES` stays three.** Selected, Saving, Failed and Out of hours are view state, layered in the UI, never added to the database contract from spec 0002.
4. **Color is never the only signal.** Every state carries an icon and an accessible name too.
5. **Focus is never removed.** `:focus-visible` only, always a visible ring, never `outline: none` without a replacement.
6. **The grid shell renders on the server.** Only the interactive cell layer and the realtime subscription are client components, so the first paint is real per the rendering rule in `AGENTS.md`.
7. **Motion is optional.** Every transition and animation sits inside a `prefers-reduced-motion` guard.
8. **One theme, in the served HTML.** There is no theme to choose, so no cookie, no script and no flash. `viewport.colorScheme` is `light` and `themeColor` matches `--background`.

**Security model**

Nothing here reads or writes data, so there is no authorization rule of its own. Two things still matter. The shell reveals staff controls through the Better Auth session (spec 0004), which is a convenience, not a control: the real enforcement stays in the row level security policies from spec 0002. And Outfit is self hosted at build time, so no visitor's address reaches a font host, which keeps the public board clean ahead of feature 12.

**Configuration required**

None. No new environment variable, secret or third party account.

**Critical test scenarios**

- Happy path: the grid renders a real day of cells on a 375px viewport, sideways scrolling with the time column pinned and eight hours visible, verifies **AC-7**, **AC-9**
- Accessibility: every foreground and background pair on `/design` passes AA, and the seven states remain distinguishable with color removed, verifies **AC-4**, **AC-5**
- Keyboard: one Tab reaches the grid, arrow keys walk the cells, focus stays visible throughout, verifies **AC-8**
- Failure case: the realtime channel drops, the indicator reads not live with an age, the grid stays readable and recovers by itself, verifies **AC-12**
- Reduced motion: with `prefers-reduced-motion: reduce`, a changed cell is still marked and nothing animates, verifies **AC-11**
- Auth: signed out, the shell shows no staff control anywhere in the markup, verifies **AC-10**
- Day switch: pressing the next day arrow spins only that arrow, leaves the previous arrow and the calendar trigger disabled but static, updates the heading immediately, and dims the grid until the new day lands; the same holds for a calendar pick, which spins the calendar trigger instead; a target the server refuses lands on the existing "could not be shown" notice with none of the three signals left stuck, verifies **AC-13** (revised). _Since spec 0014, a refused or failed day read snaps back to the day on screen with a toast instead; its scenarios there replace this last clause._

## Standard definition

This is a cross cutting standard: every screen follows it.

**Canonical pattern**

```tsx
// The one right way: semantic tokens, cva variants, an icon and a name per state.
const cell = cva("grid place-items-center rounded-[--radius-cell] h-[--row-h] text-[0.8125rem] font-semibold tabular-nums", {
  variants: {
    view: {
      available: "bg-state-available text-state-available-fg",
      booked: "bg-state-booked text-state-booked-fg",
      unavailable: "bg-state-unavailable text-state-unavailable-fg",
    },
  },
});

<div role="gridcell" tabIndex={isFocused ? 0 : -1} className={cn(cell({ view }))}>
  <Icon aria-hidden />
  <span className="sr-only">{CELL_VIEW_NAME[view]}</span>
</div>;
```

**Replaces**

- Raw Tailwind color utilities in components, for example `bg-blue-500` or `text-gray-600`.
- Hand written `dark:` pairs on any color utility.
- The Geist fonts and the starter `:root` block currently in `app/globals.css`.
- Icons from `lucide-react`. Every icon is Phosphor: `@phosphor-icons/react` in a `"use client"` file, `@phosphor-icons/react/ssr` everywhere else, because the main entry uses React context and fails in a Server Component.
- `text-primary` on text. Yellow cannot be read on white; use `text-link`.
- Importing `cn` from the `cn` package directly. Always import it from `@/lib/utils`, which teaches the merger the six type steps so `text-body` survives next to `text-foreground`.
- Any state told apart by color alone, or by an icon with no accessible name.

**Enforcement**

Strongest feasible here is a lint rule plus a visible proof surface. Add an ESLint rule to `eslint.config.mjs` banning raw Tailwind color utilities and the `dark:` variant in `app/` and `components/`, wired into `npm run lint`, which `npm run check` already gates on. The `/design` page is the second half: it is where a contrast or grayscale failure is visible rather than argued about. Prettier still owns layout, so this rule must be about tokens, never about formatting.

**Rollout**

New code immediately. The only existing code is the placeholder `app/page.tsx` and the starter block in `app/globals.css`, both replaced by this build, so there is no debt to track.

**Exceptions**

The `/design` page itself may name raw values where it is demonstrating what a token resolves to. Nothing else.

## Build plan

Ordered as a Tracer Bullet. Tasks 1 to 6 are the thin real thread: a token reaches a rendered, contrast verified cell. Everything after thickens it.

1. [x] Swap Geist for Inter through `next/font/google`, delete the starter block in `app/globals.css`, and initialise shadcn (`components.json`, `cn` in `lib/utils.ts`, `lucide-react`, `sonner`, `tw-animate-css`), satisfies **AC-15**
2. [x] Write the token layer: plain CSS variables on `:root`, the dark values inside `@media (prefers-color-scheme: dark)`, `@theme inline` mapping them to Tailwind utilities, and `@custom-variant dark` pointed at the same media query. Tokens must be top level, never nested. The shadcn CLI writes a `.dark` class block by default, so convert its generated output rather than accepting it. Add the token lint rule to `eslint.config.mjs` in the same task, so it guards every component written after this point rather than catching them at the end, satisfies **AC-1**
3. [x] Build the `/design` route with `robots: { index: false }`, showing every color token, the type scale, the spacing subset and the radii, in both themes, satisfies **AC-3**
4. [x] Add the shadcn base components (button, input, select, sheet, dialog, sonner, skeleton, badge, separator, alert, empty) and render each on `/design`, satisfies **AC-14**
5. [x] Define the `CellView` type, the icon map and the accessible name map, then build `ScheduleCell` with all seven views, shown on `/design`, satisfies **AC-5**
6. [x] Verify contrast on `/design`: every pair at AA in both themes, and every state readable with color removed. Adjust lightness only, satisfies **AC-4**
7. [x] Add `formatSlotLabel` to `lib/time.ts` for the compact 12 hour rule, with unit tests covering noon, midnight and a half hour slot, satisfies **AC-9**
8. [x] Build `ScheduleGrid`: the `GridView` union, CSS grid, sticky time column inside a sideways scroller, 44px rows, the time column in tabular figures, ARIA grid roles and a roving tabindex. Give each cell a `scroll-margin-left` equal to `--col-time` so arrow key focus never lands under the pinned column, and keep the focus ring inset so the sticky column cannot clip it, satisfies **AC-7**, **AC-8**
9. [x] Build `StateLegend` and place it on the grid, satisfies **AC-6**
10. [x] Build `AppShell` and `DayNav`: wordmark, day navigation, and the staff slot gated by Clerk `<Show when="signed-in">`, satisfies **AC-10**
11. [x] Build `LiveIndicator` with the channel status mapping and the 3 second delay, and the `useChangedCells` hook plus the highlight, both honoring `prefers-reduced-motion`, satisfies **AC-11**, **AC-12**
12. [x] Build `GridSkeleton`, `EmptyState` for no courts and for closed all day, and `ErrorState` with a retry, satisfies **AC-13**
13. [x] Generate the favicon letter mark and the text based social card route, and remove any leftover starter asset, satisfies **AC-16**
14. [x] Write `docs/design.md` covering type, color, spacing, the state vocabulary, the component inventory and the accessibility rules, pointing at `app/globals.css` as the source of truth, satisfies **AC-2**
15. [x] Revision, 2026-09-18: found by using the board that a day switch through the arrows or the calendar showed no loading feedback at all, `GridSkeleton` included, because a same route search parameter change never reaches `loading.tsx`. Wrapped `DayNav`'s `router.push` in `useTransition`, scoped the resulting spinner to the control pressed, made the heading update optimistically, and dimmed the grid in `PublicBoard`/`StaffBoard` while a change is in flight, threaded through a new `dayNavPending` field on each board's schedule context, satisfies **AC-13** (revised)
16. [x] Revision, 2026-09-25 and 2026-09-26: applied the shadcn preset `bQEdqZEKm` (maia, stone, yellow, Phosphor) over every component in `components/ui/`, moved all app icons from lucide to Phosphor (server files on the `/ssr` entry, `optimizePackageImports` for the barrel), swapped the fonts for Outfit, rewrote the palette on the preset's values and darkened the four that missed AC-4, added `--link` and the chart ramp, pointed `cn` at `cn/config` with the type scale, stripped the preset's `dark:` classes and `.dark` palette, and updated the character, type and colour role sections of `docs/design.md`, the `/design` intro and token gallery, and the favicon and social card colors, satisfies **AC-1**, **AC-4**, **AC-5**, **AC-15**

## Consequences

**Positive**

- Features 5, 6 and 7 compose rather than invent, which is the whole point of doing this before the slice.
- Accessible dialogs, selects and toasts are proven code you own, not a runtime dependency and not a hand rolled guess.
- One token layer means a color change is one edit, and `/design` makes a regression visible rather than theoretical.
- Icon plus color plus an accessible name means the board works in glare, in grayscale and through a screen reader.

**Negative and tradeoffs**

- shadcn brings its dependencies (since the 2026-09-26 revision: `@phosphor-icons/react`, `sonner`, `class-variance-authority`, `cn`, and `shadcn` itself for `shadcn/tailwind.css`) plus generated source you now maintain. It is your code, which cuts both ways.
- The board is not pixel exact to the preset: four colors are darker than shipped so every pair clears AA, and the outline button and input fills use `--border` so the darker `--input` edge does not turn them grey.
- Phosphor has two entries. A Server Component that imports from the main entry fails at render, so the `/ssr` rule in the Standard is load bearing, and Phosphor needs `optimizePackageImports` in `next.config.ts` because Next does not optimize its barrel by default.
- Light only means a reader with dark mode on gets a bright page at night. Accepted: the board is read outdoors in daylight far more than in a dark room.
- The ARIA grid pattern with a roving tabindex is the hardest thing in this spec and the easiest to get subtly wrong. Budget real time for task 8, and expect the interaction between keyboard focus and the pinned column to need fiddling even with the scroll margin mitigation.
- A system built before the screens that consume it will need adjusting when features 6 and 7 land. Expect a second pass, not a finished artifact.
- `/design` is another surface that can drift from the truth if nobody keeps it current.
- `GridSkeleton` now covers fewer cases than AC-13 originally promised: it is a hard load surface only. A day switch relies on three smaller, separately scoped signals (a control's own spinner, the optimistic heading, the dimmed grid) instead of one component, which is more state to keep in sync across `DayNav` and each board's context, in exchange for feedback that actually appears at the moment the framework will show it.

**Neutral**

- A future `npx shadcn@latest add` or `apply` rewrites `components/ui/` and `app/globals.css` in the preset's own style. Expect to strip `dark:` classes again, point `cn` imports back at `@/lib/utils`, and re check `/design`.
- The shadcn token names become the project's vocabulary, so the design language and the component library cannot diverge. That is a deliberate coupling.
- The `AGENTS.md` rule that ESLint owns real problems and Prettier owns layout still holds; the new lint rule is about tokens, not formatting.
- Removing Geist touches `app/layout.tsx`, which spec 0001 established. No architectural rule changes.

## Follow-up

- [ ] `shadcn`, `accessibility` and `suggest-lucide-icons` were installed during this design and are not yet in root `AGENTS.md` `## Agent skills`. They are project wide (styling and components reach every file), so they belong at root level, not in a nested context file.
- [ ] Record the declined tool skills so nothing offers them again: the Class Variance Authority skill, the Radix design system skill, the web typography skill, the Next.js App Router patterns skill and the Playwright a11y skill. No MCP server exists for any of these tools.
- [ ] Once the components exist, consider an automated contrast check so AA is a test rather than a look. Route it through `/test`.
- [ ] The venue name is a constant because `venue_settings` has no name column. If Ella ever wants to rename the venue without a deploy, that is a change to spec 0002, not to this one.
- [ ] Player self booking, in the Deferred list, plugs into the Selected view defined here. Revisit whether Selected needs to survive a page load at that point.
- [x] Spec 0006's critical test scenario for its AC-12 states "navigating days shows the skeleton", which is now inaccurate per the 2026-09-18 revision above (a day switch dims the grid and spins the control pressed, it does not show `GridSkeleton`). A small wording touch there, pointing at this spec's "Day switch loading" section, would keep the two specs from disagreeing; left for the engineer to fold in with `/sync` or a future spec 0006 touch, since this revision was scoped to spec 0003 only. _Done 2026-09-29, in the spec 0014 amendment pass._
- [ ] Spec 0011 added `DatePicker` (the "Pick a date" calendar trigger) to `DayNav` but never added it to this spec's Component surface table or to AC-14's component list, a gap that predates this 2026-09-18 revision and is only now visible because the new "Day switch loading" text names the calendar trigger as one of the three controls. Worth a small `/sync` pass adding a `DatePicker` row (kind: client, key inputs `date`, `timezone`, `horizonDays`, `navigate`, `pending`, `disabled`; source: shadcn `Calendar` + `Popover`, per spec 0011) so the two specs agree on the full component inventory.
- [ ] `suggest-lucide-icons` no longer matches the icon set now that the project is on Phosphor. Consider removing it from `.agents/skills/` and root `AGENTS.md`, or keeping it only for concept lookups; a `/sync` pass can settle it.
- [ ] Other specs still describe the old look: spec 0008 AC-6 promises chart colors that pass "both themes", and spec 0009 AC-6 names a `CircleAlert` icon (now `WarningCircleIcon`). Worth a `/sync` pass so they agree with this revision.
- [ ] The Phosphor server entry rule is only enforced by a failing render. A check in `lib/import-boundaries.test.ts` that no file without `"use client"` imports the main `@phosphor-icons/react` entry would catch it in `npm run check`. Route it through `/test`.
- [ ] The earlier "premium-club-white" redesign sits in `git stash` (`stash@{0}`), set aside for this preset. Drop it once you are sure nothing in it is wanted.
- [ ] `docs/design.md` still describes the dark theme this spec no longer has: the "Never name a theme" rule (theme toggle, cookie, `data-theme`), the `--light-*` and `--dark-*` pairs, the `ThemeToggle` row in its component table, and "in both themes" in several places. Rewrite those parts as light only so AC-2 holds again. It is a docs change, so a small `/develop` pass.
