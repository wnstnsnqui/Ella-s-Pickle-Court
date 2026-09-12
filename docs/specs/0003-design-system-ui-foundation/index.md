# 0003. Design system and UI foundation for the schedule boards

**Date**: 2026-09-09
**Status**: In Progress

## Summary

Every screen in this product is the same grid: time down the side, a column per court, each cell reading Booked, Available or Unavailable. This spec settles the visual language that grid is built from, and ships the components that carry it. The look is a clean utility board (near neutral canvas, Inter, the cell states carrying nearly all the color), states are told apart by an icon as well as a color, and interactive pieces come from shadcn/ui so the accessible behaviour is not hand rolled. Tokens in `app/globals.css` are the one source of truth, `docs/design.md` explains them for a person, and a `/design` page shows every component and state in both themes so a contrast failure is something you can see rather than something you hope about.

## Requirements

**User stories**

- As a player standing outdoors in daylight, I want to tell Booked from Available at a glance on my phone, so that I know whether to drive over.
- As a player who does not see color the way most people do, I want each state to carry a shape as well as a color, so that the board still works for me.
- As a staff member working a tablet all day, I want cells large enough to hit and a keyboard that moves through the grid quickly, so that keeping the schedule current is not a chore.
- As a staff member, I want to know when the board has stopped being live, so that I never act on a stale grid.
- As the engineer building features 5 to 7, I want the tokens and components to already exist, so that each screen composes rather than invents.

**Acceptance criteria** (the contract, each independently checkable)

- **AC-1**: Color, type, spacing, radius, elevation and motion exist once as tokens in `app/globals.css`. No component carries a raw color value. Light and dark values are both defined, dark follows the device setting with no toggle and no flash of the wrong theme on first paint.
- **AC-2**: `docs/design.md` documents the type scale, the color roles, the spacing subset, the state vocabulary, the component inventory and the accessibility rules, and names the tokens in `app/globals.css` as the source of truth.
- **AC-3**: A `/design` route renders every token, every base component and every cell state on one page, works without signing in, and is excluded from search indexing.
- **AC-4**: Every text and icon pair meets WCAG 2.2 AA in both themes: 4.5:1 for body text, 3:1 for large text, icons, focus rings and component boundaries. Verified on `/design`.
- **AC-5**: Each of Available, Booked, Unavailable, Out of hours, Selected, Saving and Failed has a distinct Lucide icon, a distinct color pair, and an accessible name a screen reader announces. All seven stay distinguishable with color removed.
- **AC-6**: A legend mapping every icon to its word is present on both the public and the staff board, not hidden behind a tap, and fits in one compact row so it does not eat the visible hours AC-7 requires.
- **AC-7**: On a phone the grid scrolls sideways with the time column pinned to the left, rows are at least 44px tall, and at least seven full slot rows are visible below the header, the day navigation and the legend on a 375 by 667 viewport. The layout survives 200 percent browser zoom with no content lost or overlapped.
- **AC-8**: The grid is a single tab stop. Arrow keys move between cells, Home and End move within a row, Page Up and Page Down move a screenful, and the focused cell always shows a visible focus ring. Roles follow the ARIA grid pattern.
- **AC-9**: Slot labels read in compact 12 hour form in the venue timezone by the rule in `## Feature design`: `9am` on the hour, `12nn` at noon, `12mn` at midnight, `4:30pm` otherwise. Set in tabular figures so the time column never changes width as the day scrolls.
- **AC-10**: One shell carries the venue wordmark, the day navigation and the live indicator on both boards. Staff only controls render solely when Clerk reports a signed in user.
- **AC-11**: A cell whose state changed under a reader holds a brief highlight. Under `prefers-reduced-motion: reduce` the animation is skipped and the highlight is still perceivable.
- **AC-12**: When the realtime channel leaves `SUBSCRIBED` the indicator reads reconnecting, and after 3 seconds it reads not live and states how old the data is. A drop that recovers inside that window never shows as not live. The grid stays readable throughout and the indicator returns to live by itself.
- **AC-13**: Loading, empty and error states exist and are used: server rendered first paint by default, a skeleton grid while switching day, an empty state for no courts and for a day the venue is closed, and an error state with a retry.
- **AC-14**: The interactive components feature 6 needs exist and follow the system: button, input, select, sheet, dialog, toast, skeleton, badge, separator, alert and empty.
- **AC-15**: Inter is the only typeface, self hosted at build time through `next/font`, so no request reaches a third party font host at runtime. Geist is removed from the project.
- **AC-16**: The system ships no image assets. The wordmark is set in type, the favicon is a generated letter mark, and the social card is generated from text at request time.

## Decision

**Chosen option**: Option 2: A token first system on Tailwind 4, with shadcn/ui supplying the accessible interactive primitives.

Design tokens live once in `app/globals.css` and are exposed to Tailwind through `@theme inline`. Every color a component uses is a semantic token, never a raw value. shadcn/ui copies the source of the dialogs, sheets, selects and toasts into the repo, so the hard accessibility behaviour is proven code you own rather than a runtime dependency or a hand rolled guess. The schedule cell and grid, the pieces no library has, are built on top of those same tokens.

**Implementation skills**: `shadcn` (`shadcn/ui`, `.agents/skills/shadcn/`) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`) · `tailwind-4-docs` (`lombiq/tailwind-agent-skills`, `.agents/skills/tailwind-4-docs/`) · `suggest-lucide-icons` (`nweii/agent-stuff`, `.agents/skills/suggest-lucide-icons/`)

## Rationale

The reasoning, the options weighed, and a premise note about building this before the pages that consume it: see [rationale.md](rationale.md).

## Feature design

**Token model** (the entities of a design system; all live in `app/globals.css`, nothing is stored)

| Group   | Tokens                                                                                                                       | Notes                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Surface | `--background`, `--foreground`, `--card`, `--muted`, `--muted-foreground`, `--border`, `--ring`                              | The shadcn semantic names, adopted as ours so there is one vocabulary, not two.                                      |
| Accent  | `--primary`, `--primary-foreground`, `--destructive`, `--destructive-foreground`                                             | Primary is ink, a near black. State color is the only real color on screen.                                          |
| State   | `--state-available`, `--state-booked`, `--state-unavailable`, `--state-outofhours`, `--state-selected`, each with `-fg` and `-border` | Five color roles the grid owns. Saving and Failed reuse `--muted` and `--destructive`.                                |
| Type    | `--font-sans` (Inter), plus the six step scale below                                                                         | One family. Tabular figures are a utility, not a token.                                                              |
| Space   | `--radius` at `0.5rem`, `--radius-cell` at `0.25rem`, `--row-h` at `2.75rem`, `--col-time` at `3.5rem`, `--col-court-min` at `5.5rem` | The grid's fixed geometry. Ordinary spacing uses the Tailwind scale, restricted to `1 2 3 4 6 8 12`.                  |
| Motion  | `--dur-fast` at `120ms`, `--dur-slow` at `1.2s`                                                                              | Slow is the changed cell highlight. Every transition sits inside a reduced motion guard.                              |

Starting palette in OKLCH (a color space where equal lightness numbers look equally light, which is what makes a contrast pair predictable). The build may nudge lightness to reach AA but must not change hue:

| Role        | Light                                                       | Dark                                                        |
| ----------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| background  | `oklch(0.99 0 0)`                                           | `oklch(0.17 0.008 260)`                                     |
| foreground  | `oklch(0.20 0.010 260)`                                     | `oklch(0.96 0.003 260)`                                     |
| muted / fg  | `oklch(0.96 0.002 260)` / `oklch(0.48 0.010 260)`           | `oklch(0.23 0.006 260)` / `oklch(0.68 0.010 260)`           |
| border      | `oklch(0.91 0.004 260)`                                     | `oklch(0.28 0.008 260)`                                     |
| primary     | `oklch(0.22 0.010 260)`                                     | `oklch(0.95 0.003 260)`                                     |
| available   | `oklch(0.94 0.055 150)` on bg, fg `oklch(0.38 0.100 150)`   | `oklch(0.28 0.055 150)` on bg, fg `oklch(0.86 0.110 150)`   |
| booked      | `oklch(0.93 0.050 250)` on bg, fg `oklch(0.40 0.125 250)`   | `oklch(0.28 0.055 255)` on bg, fg `oklch(0.85 0.100 255)`   |
| unavailable | `oklch(0.95 0.003 260)` on bg, fg `oklch(0.50 0.010 260)`   | `oklch(0.22 0.005 260)` on bg, fg `oklch(0.64 0.010 260)`   |
| out of hours| `oklch(0.96 0.012 285)` on bg, fg `oklch(0.47 0.040 285)`   | `oklch(0.21 0.020 285)` on bg, fg `oklch(0.68 0.045 285)`   |
| selected    | `oklch(0.90 0.030 260)` on bg, fg `oklch(0.25 0.020 260)`, border `oklch(0.55 0.060 260)` at 2px | `oklch(0.32 0.030 260)` on bg, fg `oklch(0.96 0.005 260)`, border `oklch(0.72 0.060 260)` at 2px |
| destructive | `oklch(0.55 0.180 27)`, fg `oklch(0.99 0 0)`                | `oklch(0.62 0.170 27)`, fg `oklch(0.16 0.010 27)`           |
| primary fg  | `oklch(0.99 0 0)`                                           | `oklch(0.17 0.008 260)`                                     |
| ring        | `oklch(0.45 0.020 260)`                                     | `oklch(0.78 0.020 260)`                                     |

Selected is the one state told apart by a border weight as well as a fill, because it sits on top of whatever state the cell already had and must not hide it.

Type scale, all Inter: display `1.75rem/2rem 600` · title `1.25rem/1.75rem 600` · body `0.9375rem/1.375rem 400` · label `0.8125rem/1.125rem 500` · cell `0.8125rem/1 600 tabular` · caption `0.75rem/1rem 400`.

**Cell state vocabulary** (the state machine of a cell as a reader sees it)

| View          | Comes from                                              | Icon (Lucide)   | Color role        | Accessible name         |
| ------------- | ------------------------------------------------------- | --------------- | ----------------- | ----------------------- |
| Available     | `CellState` `available` from `lib/schedule/grid.ts`      | `circle-check`  | `--state-available`   | "Available"             |
| Booked        | `CellState` `booked`                                     | `calendar-check`| `--state-booked`      | "Booked"                |
| Unavailable   | `CellState` `unavailable`                                | `ban`           | `--state-unavailable` | "Unavailable"           |
| Out of hours  | `GridRow.outOfHours` is true (spec 0002 AC-11)           | `moon`          | `--state-outofhours`  | "Outside opening hours" |
| Selected      | Browser state only, never from the database             | `circle-dot`    | `--state-selected`    | "Selected"              |
| Saving        | Browser state while a Server Action is in flight        | `loader-circle` | `--muted`             | "Saving"                |
| Failed        | A Server Action returned a conflict or an error         | `triangle-alert`| `--destructive`       | "Change refused"        |

Out of hours is a row flag layered over the three real states, not a fourth. Selected, Saving and Failed are browser state layered over them. `CELL_STATES` in `lib/schedule/constants.ts` stays exactly three values; this vocabulary is a separate `CellView` type in the UI layer, so the database contract from spec 0002 is untouched.

**Component surface**

| Component         | Kind    | Key inputs                                          | States it must render                            | Source          |
| ----------------- | ------- | --------------------------------------------------- | ------------------------------------------------ | --------------- |
| `AppShell`        | server  | `children`, `slot` for staff controls               | signed in, signed out                            | new             |
| `LiveIndicator`   | client  | `channelStatus`, `lastUpdatedAt`                    | live, reconnecting, not live with age            | new             |
| `DayNav`          | client  | `date` (from the URL), `timezone`, `horizonDays`    | today, past, at the booking horizon              | new             |
| `ScheduleGrid`    | client  | one `view` input, the union below                   | ready, loading, empty, error, 200 percent zoom   | new             |
| `ScheduleCell`    | client  | `view: CellView`, `label`, `onSelect`               | the seven views above, focused, disabled          | new             |
| `StateLegend`     | server  | none                                                | fixed                                            | new             |
| `GridSkeleton`    | server  | `rows`, `courts`                                    | fixed                                            | `Skeleton`      |
| `EmptyState`      | server  | `title`, `body`, `action`                           | no courts, closed all day                        | `Empty`         |
| `ErrorState`      | client  | `message`, `onRetry`                                | load failed                                      | `Alert`         |
| Button, Input, Select, Sheet, Dialog, Toast, Badge, Separator | mixed | per shadcn | per shadcn | shadcn/ui |

`ScheduleGrid` takes exactly one input, so it cannot be asked to render a state it has no data for:

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

**Slot label rule** for AC-9: on the hour reads `9am`, noon reads `12nn`, midnight reads `12mn`; anything else carries its minutes, `4:30pm`. Always the venue timezone, never the reader's.

**Value sourcing**

| Surface        | Value shown                        | Source                                                                                                                  |
| -------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Time column    | compact 12 hour slot label         | New `formatSlotLabel(row.label, timezone)` in `lib/time.ts`, derived from `GridRow.label`, which is `HH:mm` in venue time |
| Cell           | which of the three states          | `GridCell.state` from `lib/schedule/grid.ts`, decided in spec 0002 AC-5                                                  |
| Cell           | out of hours marking               | `GridRow.outOfHours`, decided in spec 0002 AC-11                                                                        |
| Cell           | the accessible name                | The `CellView` to name map in this spec, not from the database                                                          |
| Court header   | court name and order               | `court.name` and `court.sort_order`, spec 0002                                                                          |
| Day navigation | the day being shown                | The `?date=YYYY-MM-DD` search parameter, read on the server. Absent or unparseable means today at the venue             |
| Day navigation | which days may be picked           | `venue_settings.booking_horizon_days` and `timezone`, spec 0002                                                         |
| Grid           | which cells just changed           | The `useChangedCells` hook comparing the previous grid to the new one on the client. Never a server or database value   |
| Live indicator | live or not live                   | The Supabase realtime channel state on the client, spec 0001 rule 5                                                     |
| Live indicator | how old the data is                | Client clock at the last successful server render or realtime message. Not a database value, so it is never trusted as one |
| Shell          | venue name in the wordmark         | A single exported constant, since `venue_settings` has no name column. Recorded as a Follow-up if that ever changes     |
| Shell          | whether staff controls render      | Clerk `<Show when="signed-in">`, per the Clerk 7 rule in `AGENTS.md`                                                    |
| Cell           | Saving and Failed                  | The Server Action's own pending and error result, never persisted                                                       |

**Key invariants**

1. [x] **One token layer.** A color, radius, row height or duration appears once, in `app/globals.css`. A raw color in a component is a defect.
2. [x] **No `dark:` color overrides.** Semantic tokens carry both themes, so a component never names a theme.
3. [x] **`CELL_STATES` stays three.** Selected, Saving, Failed and Out of hours are view state, layered in the UI, never added to the database contract from spec 0002.
4. [x] **Color is never the only signal.** Every state carries an icon and an accessible name too.
5. [x] **Focus is never removed.** `:focus-visible` only, always a visible ring, never `outline: none` without a replacement.
6. [x] **The grid shell renders on the server.** Only the interactive cell layer and the realtime subscription are client components, so the first paint is real per the rendering rule in `AGENTS.md`.
7. [x] **Motion is optional.** Every transition and animation sits inside a `prefers-reduced-motion` guard.

**Security model**

Nothing here reads or writes data, so there is no authorization rule of its own. Two things still matter. The shell reveals staff controls through Clerk state, which is a convenience, not a control: the real enforcement stays in the row level security policies from spec 0002. And Inter is self hosted at build time, so no visitor's address reaches a font host, which keeps the public board clean ahead of feature 12.

**Configuration required**

None. No new environment variable, secret or third party account.

**Critical test scenarios**

- Happy path: the grid renders a real day of cells on a 375px viewport, sideways scrolling with the time column pinned and eight hours visible, verifies **AC-7**, **AC-9**
- Accessibility: every foreground and background pair on `/design` passes AA in both themes, and the seven states remain distinguishable with color removed, verifies **AC-4**, **AC-5**
- Keyboard: one Tab reaches the grid, arrow keys walk the cells, focus stays visible throughout, verifies **AC-8**
- Failure case: the realtime channel drops, the indicator reads not live with an age, the grid stays readable and recovers by itself, verifies **AC-12**
- Reduced motion: with `prefers-reduced-motion: reduce`, a changed cell is still marked and nothing animates, verifies **AC-11**
- Auth: signed out, the shell shows no staff control anywhere in the markup, verifies **AC-10**

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

## Consequences

**Positive**

- Features 5, 6 and 7 compose rather than invent, which is the whole point of doing this before the slice.
- Accessible dialogs, selects and toasts are proven code you own, not a runtime dependency and not a hand rolled guess.
- One token layer means a color change is one edit, and `/design` makes a regression visible rather than theoretical.
- Icon plus color plus an accessible name means the board works in glare, in grayscale and through a screen reader.

**Negative and tradeoffs**

- shadcn brings five new dependencies (`lucide-react`, `sonner`, `class-variance-authority`, `clsx`, `tailwind-merge`) plus generated source you now maintain. It is your code, which cuts both ways.
- Dark mode doubles every color decision and every contrast check, from day one, forever.
- The ARIA grid pattern with a roving tabindex is the hardest thing in this spec and the easiest to get subtly wrong. Budget real time for task 8, and expect the interaction between keyboard focus and the pinned column to need fiddling even with the scroll margin mitigation.
- A system built before the screens that consume it will need adjusting when features 6 and 7 land. Expect a second pass, not a finished artifact.
- `/design` is another surface that can drift from the truth if nobody keeps it current.

**Neutral**

- The shadcn token names become the project's vocabulary, so the design language and the component library cannot diverge. That is a deliberate coupling.
- The `AGENTS.md` rule that ESLint owns real problems and Prettier owns layout still holds; the new lint rule is about tokens, not formatting.
- Removing Geist touches `app/layout.tsx`, which spec 0001 established. No architectural rule changes.

## Follow-up

- [ ] `shadcn`, `accessibility` and `suggest-lucide-icons` were installed during this design and are not yet in root `AGENTS.md` `## Agent skills`. They are project wide (styling and components reach every file), so they belong at root level, not in a nested context file.
- [ ] Record the declined tool skills so nothing offers them again: the Class Variance Authority skill, the Radix design system skill, the web typography skill, the Next.js App Router patterns skill and the Playwright a11y skill. No MCP server exists for any of these tools.
- [ ] Once the components exist, consider an automated contrast check so AA is a test rather than a look. Route it through `/test`.
- [ ] The venue name is a constant because `venue_settings` has no name column. If Ella ever wants to rename the venue without a deploy, that is a change to spec 0002, not to this one.
- [ ] Player self booking, in the Deferred list, plugs into the Selected view defined here. Revisit whether Selected needs to survive a page load at that point.
