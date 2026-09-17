# 0011. Calendar date picker: rationale

## Context

`DayNav` (`components/day-nav.tsx`) is the one component both boards share to move between days: a previous arrow, a next arrow disabled at `booking_horizon_days`, and a Today link when the shown day is not today. It was built for spec 0003 and reused as is by spec 0006 (the public board) and spec 0005/0007 (the staff board). Moving one day at a time is fine for the common case, checking today or tomorrow, but the venue's booking horizon can already be set as far as a year out (spec 0007, AC-8), and staff have no lower bound on how far back they can look either. Reaching a day two months away today means dozens of taps, one per day, on a control built for the opposite case.

The forces at play: the fix has to reach both boards, because `DayNav` is shared and the two boards already disagree on one rule (the public board should never offer a day before today, since the server refuses it anyway with a notice; the staff board deliberately allows looking back). It has to add nothing to what a visitor or a staff member can actually do: the server side date validation that already decides what may render (spec 0006 AC-2, spec 0007 AC-12) is the enforcement point, and a faster way to reach a date must not become a second way to bypass it. And it has to fit a project that already has one consistent, tested visual language (spec 0003) built on shadcn, so a new control should look like it always belonged.

The consequence of not deciding this is a real one: as Ella's booking horizon grows toward what she has already asked for (a couple of months), the existing day by day navigation gets slower in direct proportion, right as it becomes more useful to look far ahead.

## Options considered

### Option 1: An additive calendar button, shadcn's `Calendar`, reusing the existing `BoardSheet` for its presentation

A "Pick a date" button sits beside the existing arrows. Opening it shows a month grid built from shadcn's `Calendar` component (built on `react-day-picker`, which the project's already installed `radix-ui` package and design tokens style to match), presented inside `BoardSheet`, the responsive sheet spec 0005 already built and proved (from the bottom under 768 pixels, from the right at 768 pixels and wider, with focus return solved), promoted from `components/staff/` to a shared location so both boards can use it.

**Pros**:

- The arrows stay for the single day flick that is still the most common move; the calendar only serves the "far away" case.
- shadcn is already the project's component source (`components.json`, `Select`, `Sheet`, `Dialog` all come from it), so the calendar matches every other control on the board with no new visual language to build or maintain.
- `react-day-picker` already solves the keyboard grid navigation, the disabled day semantics and the month paging that AC-5 needs; building that by hand is a real accessible widget project on its own.
- Reusing `BoardSheet` instead of adding a second presentation (a popover for wide screens) means the viewport switch, the contrast pass and the focus return on close arrive already proven by every staff sheet that uses it today, rather than being built and tested again for this one control.

**Cons**:

- One new dependency (`react-day-picker`) lands in `package.json` for what is, underneath, a fairly small feature.
- A full sheet is a heavier presentation than a small anchored popover would have been for picking a single day, especially on a wide screen where it slides in from the right the same way a booking form does.
- `BoardSheet` and its `useMediaQuery` helper move out of `components/staff/`, so this option touches four existing staff components' import paths (mechanically, with no behaviour change) that a purely additive feature would otherwise leave alone.

### Option 2: Replace the arrows with the calendar entirely

The calendar becomes the only way to change day; the toolbar simplifies to one button.

**Pros**:

- One control instead of two; less to maintain long term.

**Cons**:

- The single day flick, which is the board's most frequent move (a player checking tomorrow, staff closing out today and opening tomorrow), becomes two taps (open the calendar, then pick the very next day) instead of one. This is a regression for the common case to make the rare case easier.

### Option 3: A native `<input type="date">`

No new dependency; the browser supplies its own date picker.

**Pros**:

- Zero new dependencies, zero custom accessibility work; the browser already handles keyboard and screen reader use for its own control.

**Cons**:

- Its look, its keyboard behaviour and even whether it opens a calendar at all differ across browsers and platforms, which breaks the project's one consistent visual language (spec 0003).
- Disabling a day with a reason (AC-3) is not something the native control lets a page express; `min`/`max` bound the whole range but cannot mark or explain a gap or a mid range restriction, and there is none needed here, but the same limitation means no accessible "why" for the disabled bound.
- The value is a browser-local date, and this project has already built its own timezone-safe local date handling (`lib/time.ts`) that a native input's value does not go through cleanly.

## Rationale

Option 1 is the only one that keeps the single day flick fast while making the far away case fast too; Option 2 trades one for the other, and the single day flick is the more frequent move by the project's own description of both boards ("staff on shift keep each court current", "players check it from their phones"). Option 3's cross browser inconsistency would be the first control on either board that does not share the project's visual language, and its inability to express a disabled day with a reason would leave AC-3 half built.

Choosing shadcn over a hand built calendar is a direct application of the project's own convention: `components.json` already configures shadcn as the component source, and every other non-trivial input (`Select`, `Sheet`, `Dialog`) already comes from it. One new dependency for a mature, accessible, actively maintained calendar (`react-day-picker`) is a small price next to hand rolling keyboard grid navigation and disabled day semantics from scratch, and it keeps the codebase boring in the way `AGENTS.md`'s own tooling choices already are (shadcn CLI, not a bespoke design system). Reusing `BoardSheet` rather than adding a `Popover` for wide screens follows the same instinct one step further: the project already has one proven, accessible, responsive sheet, and a second presentation would only duplicate what it already does, at the cost of moving it (and its `useMediaQuery` helper) out of `components/staff/` so the public board can reach it too.

The bounds only decision (no closed day or fully booked shading) keeps this one decision rather than two: showing a day is closed needs only the opening hours already loaded, but showing a day is fully booked needs a new query across the whole visible range, which is its own tradeoff (what triggers a refetch, what a stale answer looks like) that deserves its own pass through `/architect` rather than riding along here.
