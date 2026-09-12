# 0003. Rationale: design system and UI foundation

The reasoning behind [index.md](index.md). `/develop` does not need this file.

## Context

> ⚠️ Premise note: this feature builds a full design system before any screen that consumes it exists, which is the opposite of what Tracer Bullet asks for. The risk is real. A system designed against imagined screens gets adjusted once the real ones arrive, and the adjustment is wasted work. It is not fatal here, because a grid of three states is unusually well understood in advance and spec 0002 has already pinned the exact data every cell renders from, so there is less to imagine than usual. The build plan answers the concern rather than the scope order: tasks 1 to 6 are a real end to end thread (a token reaches a rendered cell whose contrast is verified on a real page), and only then does it thicken. Expect a second pass on this system when features 6 and 7 land, and treat that as planned rather than as a failure.

Ella's Picklecourt has one screen, shown twice. A player opens the public board on a phone, outdoors, often in bright daylight, wanting one answer: is a court free. A staff member works the same grid on a phone or a tablet at the desk all day, tapping cells to take bookings. Both are reading time down the side and a column per court, with every cell reading Booked, Available or Unavailable.

Three forces shape this. A grid is a genuinely hard thing to read on a 375px screen, and the naive answers (shrink everything, or hide most of it) both fail the people who need it. The three states have to be tellable apart in glare, at arm's length, and by someone who does not see color the way most people do, which rules out color as the only signal. And feature 6 needs real interactive pieces, a booking sheet, a select, a confirm dialog, a conflict toast, whose accessible behaviour is famously hard to hand roll correctly.

The project has almost nothing to build on. `app/globals.css` still holds the Next.js starter block with Geist and two color variables. `app/page.tsx` is a placeholder that feature 7 replaces. The stack is fixed by spec 0001 (Next.js 16 App Router, React 19, Tailwind 4, Clerk 7, Supabase) and the data every cell renders from is fixed by spec 0002 (`CellState` of three values, a per row `outOfHours` flag, courts, settings, a venue timezone).

The consequence of not deciding is that features 5, 6 and 7 each invent their own look, spacing and state treatment, and the board ends up as three different products. Retrofitting a system across finished screens costs far more than defining it now.

## Options considered

### Option 1: Hand rolled, no component library

Define tokens in `app/globals.css` and write every component from scratch, including the dialog, sheet and select feature 6 needs.

**Pros**

- Zero new dependencies and no generated code to understand.
- Every line is written for this product, so nothing is carried that is not used.

**Cons**

- You own focus trapping, focus return, scroll locking, `aria-modal` and screen reader announcement for every overlay. Each is a place to be quietly wrong, and the failure is invisible to a sighted developer.
- Feature 6 is where that cost lands, in the middle of building the schedule, which is the worst time to discover a dialog is not keyboard reachable.

### Option 2: Token first on Tailwind 4, with shadcn/ui for the interactive primitives

Tokens in `app/globals.css` are the single source of truth. shadcn's CLI copies the source of Radix backed components into the repo; the schedule cell and grid are built by hand on top of the same tokens.

**Pros**

- The hard accessibility behaviour arrives as proven, widely used code, and it lives in the repo so it can be edited without fighting a library.
- No runtime library to be locked into or to break on a major version.
- Its semantic token names (`background`, `muted-foreground`, `primary`) become the project vocabulary, so the design language and the components cannot diverge.
- The official shadcn Agent Skill is installed, so a later build follows its real conventions rather than guessing.

**Cons**

- Five new dependencies and a body of generated source you now maintain.
- Its conventions are opinionated. Fighting them is possible but wasteful, so the project inherits some decisions it did not make.

### Option 3: A full component library, for example Mantine or MUI

Adopt a batteries included React component library and theme it.

**Pros**

- The largest surface for the least code, with a date picker, table and form stack already solved.
- Accessibility and cross browser behaviour are the vendor's problem.

**Cons**

- Fights Tailwind 4 rather than composing with it, and the project is already committed to Tailwind by spec 0001.
- Themeing a large library to a specific look is usually harder than styling primitives from nothing.
- A heavy runtime dependency for an application with roughly ten components.

### Option 4: Tokens and documentation only

Write `docs/design.md` and the token layer, and let each feature build its own components against them.

**Pros**

- Fastest to finish, and nothing is built before it is needed, which is the purest reading of Tracer Bullet.

**Cons**

- A system that exists only on paper is not enforced by anything, and three features building against prose will drift.
- Feature 6 still has to solve the accessible dialog problem, just later and under more pressure.

## Rationale

Option 2 answers the two forces that actually decide this. The interactive pieces feature 6 needs are exactly the components where hand rolling is most likely to be quietly wrong, and where being wrong is invisible until someone who relies on a keyboard or a screen reader cannot book a court. Copying proven source into the repo buys that correctness without a runtime dependency, which matters for a self hosted container that has to keep working without anyone watching the ecosystem.

Option 3 was rejected on the stack, not on quality: spec 0001 committed to Tailwind 4, and a themed component library would spend the rest of the project arguing with it. Option 1 was rejected because the cost is real and lands at the worst moment. Option 4 was tempting on Tracer Bullet grounds, and the premise note above takes that concern seriously, but a standard nothing enforces is not a standard.

Two calls inside the option are worth stating. Dark mode follows the device through `@media (prefers-color-scheme: dark)` redefining the same variables, with `@custom-variant dark` pointed at the same query, rather than shadcn's default `.dark` class. No toggle was asked for, and the class approach needs a blocking script to avoid a flash of the wrong theme on first paint, which is a real cost on a page whose whole value is loading fast and being current. The runner up, shadcn's class variant, stays available the moment a manual toggle is wanted. And the accent is ink rather than a brand color, because the engineer chose a clean utility board: with Available green and Booked blue already spoken for, any third color would compete with the one thing the eye must find. The runner up was a warm amber, rejected because amber is the hardest hue to hold at AA across both themes.

One recommendation the engineer should consciously accept: the choice of an icon plus color for the states, over a written label in every cell. Icons are more compact and more hours fit on screen, but a word needs no learning and no legend. The spec closes that gap by requiring an accessible name on every state, a persistent legend on both boards, and a grayscale check, and by letting the word appear beside the icon where a column is wide enough. If the legend proves to be something nobody reads, revisit this before feature 7 ships rather than after.

## Evidence: what the repo already fixes

Read during this design, so the spec does not contradict what is built:

- `lib/schedule/constants.ts`: `CELL_STATES` is exactly `available`, `booked`, `unavailable`, and its comment states that Selected is deliberately absent because it is browser state for a later feature. This spec honors that: the seven view treatments are a UI layer type, not an addition to the database contract.
- `lib/schedule/grid.ts`: `GridRow` already carries `label` as venue local `HH:mm` and `outOfHours` as a per row flag, and `GridCell` carries `state` plus the block ids a staff screen can open. The component surface in this spec reads exactly those fields.
- `lib/time.ts`: `formatAtVenue` produces a full 12 hour time such as `4:00 PM`. The compact form the engineer chose needs a new formatter, which is why it appears as a build task rather than as an assumption.
- `supabase/migrations/20260905043037_court_schedule.sql`: `venue_settings` has no name column, so the venue name in the wordmark is a constant. Recorded as a Follow-up rather than left for the build to invent.
- `app/globals.css` and `app/layout.tsx`: still the Next.js starter, with Geist and a two variable `:root`. Both are replaced by build task 1, so there is no existing pattern to migrate.
