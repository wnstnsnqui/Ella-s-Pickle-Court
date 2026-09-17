# 0011. Calendar date picker

**Date**: 2026-09-17
**Status**: In Progress

## Summary

Right now the only way to move to a day on either board is one tap at a time with the prev and next arrows. This adds a calendar you can open from a button next to those arrows, so a player or a staff member can jump straight to a day weeks or months away in one pick instead of dozens of taps. The arrows and the Today link keep working exactly as they do now; the calendar is an addition, not a replacement. No database change is needed: the board still only shows a day the venue actually allows, the same way it does today.

## Requirements

**User stories**:

- As a player, I want to jump straight to a day weeks or months from now, so that I can plan a visit ahead of time without tapping through every day between now and then.
- As Ella or a staff member, I want to jump straight to any day within the booking window, so that I can take or check a booking far ahead without clicking through every day in between.
- As Ella or a staff member, I want to look back at any past day quickly, so that I can check what happened on a specific day without clicking back one day at a time.
- As a player, I want the calendar to only offer days the venue is actually taking bookings for, so that I do not waste a tap on a day that just shows a "could not be shown" message.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: `DayNav` gains a "Pick a date" button next to the existing prev and next day arrows, on both the public board and the staff board. Pressing it opens a calendar: a `Popover` anchored to the trigger from 768 pixels wide, sized to its own content; the existing `BoardSheet` (spec 0005, AC-15, promoted out of `components/staff/` so both boards can use it) from the bottom below that, where an anchored popup has nowhere good to point on a touch screen (revised after the first build, see the Decision note below). The calendar opens on the month containing the day currently shown, and paging is bounded (see the Value sourcing table) so nobody can page to a month where every day is disabled.
- **AC-2**: Picking a day in the calendar closes the sheet and calls `router.push(href(pickedDate))` (`next/navigation`'s `useRouter`, `href` the same builder the arrows already call), landing on `?date=YYYY-MM-DD` for that day exactly as the arrows would, as a normal history entry. The resulting page is identical to one reached by typing the date into the address bar or by tapping the arrows there one day at a time; it is a shareable link, the same as today.
- **AC-3**: On the public board, every day before venue today is disabled in the calendar, and so is every day after `today + booking_horizon_days`. On the staff board, only days after `today + booking_horizon_days` are disabled; every past day stays pickable, because staff already look back through the arrows. A disabled day is marked with `react-day-picker`'s `disabled` matcher, which sets `aria-disabled` rather than the native `disabled` attribute, so the day stays reachable by its roving tabindex grid and a screen reader still announces it, carrying the exact reason `resolveDate` already uses for the same case ("That day has passed. The board shows today onward." past; "The schedule only goes as far as `{addDays(today, horizonDays)}` for now." beyond horizon, spec 0006's `lib/schedule/queries.ts`), and it cannot be picked by pointer or keyboard.
- **AC-4**: The disabled range is computed from the same `horizonDays` and `now` values `DayNav` already receives as props. When an owner raises or lowers `booking_horizon_days` (spec 0007, AC-11, which already reaches both boards live), the calendar reflects the new bound on its very next render, because `DayNav` itself is never unmounted by a refetch, only its props change; an already open calendar simply gains or loses selectable days in place.
- **AC-5**: The trigger is a real button with the accessible name "Pick a date". The calendar is fully operable by keyboard: arrow keys move between days (including disabled ones, which are announced but do nothing on Enter or Space), Enter or Space picks a focused enabled day, Escape closes the popover or sheet and returns focus to the trigger (Radix's own focus return on the popover; `BoardSheet`'s existing `returnFocusTo` mechanism, spec 0005 AC-15, on the sheet). The trigger, the popover and the sheet meet WCAG 2.2 AA contrast in both themes.
- **AC-6**: The existing prev and next arrows and the Today link keep working exactly as they do today (spec 0003, spec 0006 AC-4/AC-10); this feature only adds to `DayNav`, it does not change the meaning of its existing `date`, `timezone`, `horizonDays`, `now` or `className` props.
- **AC-7**: This feature adds no Server Action and no new database read. The calendar's disabled days are worked out on the client from props the board already has; the page itself still resolves and validates the date server side exactly as it does today (`resolveDate`, spec 0006 AC-2, spec 0007 AC-12). A date the calendar would have disabled, reached anyway by pasting a URL, still renders the existing "could not be shown" notice or `out_of_range` handling, never a new error path.
- **AC-8**: The design gallery (`app/design/page.tsx`) shows the bare `Calendar` (not inside a sheet, which would portal outside the gallery's per swatch `data-theme` scope and so not render correctly side by side in both themes) including a disabled day, next to the existing `DayNav` entry, sourced from the same `SAMPLE_TIMEZONE`, `SAMPLE_HORIZON_DAYS` and `date` constants that entry already uses.

## Decision

**Chosen option**: Option 1: An additive calendar button, shadcn's `Calendar`, reusing the existing `BoardSheet` for its presentation on both viewports.

`DayNav` gains a "Pick a date" trigger beside the existing arrows. Opening it shows shadcn's `Calendar` inside `BoardSheet`, promoted from `components/staff/` to a shared location so both boards can use the one already built, already accessible sheet: from the bottom under 768 pixels, from the right at 768 pixels and wider, with focus return already solved. The public board disables past and beyond horizon days; the staff board disables only beyond horizon days. No schema change, no new Server Action; the calendar is a faster way to reach the same `?date=` link the arrows already build, and the server still validates every date exactly as it does today.

**Revision (2026-09-17, after the first build)**: the sheet on wide screens turned out to reserve its full edge to edge height for a calendar much shorter than the forms `BoardSheet` was built for, leaving a large empty gap below it even after a `compact` sizing fix. The engineer asked for a real popover instead; on reflection, the anchored positioning problem the first pass avoided by reusing `BoardSheet` is exactly what `PopoverContent`'s own Radix positioning already solves without extra work, so the "second presentation to build and test" cost named below did not hold up in practice. Wide (768 pixels and up) now opens a `Popover` anchored to the trigger, sized to its own content; the bottom sheet stays for narrow screens, where an anchored popup has nowhere good to point on a touch screen. `BoardSheet` keeps its `compact` sizing fix for that narrow case. This narrows AC-1 and AC-5's wording above; every other acceptance criterion, the bound math, and the disabled reasons are unchanged.

**Implementation skills**: `shadcn` (`shadcn/ui`, `.agents/skills/shadcn/`) · `tailwind-4-docs` (`lombiq/tailwind-agent-skills`, `.agents/skills/tailwind-4-docs/`) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

Calls made here rather than asked, each with its runner up:

- **Reuse `BoardSheet` instead of adding a `Popover` primitive.** *Superseded by the Revision above*: the project already had one responsive, accessible sheet with focus return solved (spec 0005, AC-15), so a `Popover` for wide screens looked like a second presentation to build and test for what the sheet already did. In practice the sheet's full height on wide screens fit a form, not a calendar, and `PopoverContent` (shadcn's `Popover`, also built on the project's installed `radix-ui` package, so no new dependency) solves the anchored positioning for free. Wide screens now use it; the sheet stays for narrow, where a `Popover` has nothing to anchor to.
- **`BoardSheet` and `useMediaQuery`/`WIDE_QUERY` move out of `components/staff/`** to a shared location (e.g. `components/board-sheet.tsx`, `components/use-media-query.ts`), since the public board needs them too. Every existing staff caller (`CourtSheet`, `BookSheet`, `EditSheet`, `CloseSheet`) updates its import path only; their behaviour is unchanged. Runner up: a second, near identical sheet component under `components/board/` for the public side, which would fork a component this spec is explicit about keeping shared (AC-6).
- **Day styling stays plain: bounds only, no closed or fully booked shading.** Marking a weekday with no opening hours would only need the settings already loaded, but marking a day fully booked needs a new aggregate query across up to a year of `reservation` rows for the whole visible month, real scope on its own. Runner up: shading closed weekdays too, deferred to a Follow-up rather than folded in here, so this spec stays one decision.
- **`DayNav` gains one new prop, `allowPastPick?: boolean`, default `false`.** `PublicToolbar` does not pass it (past stays disabled in the calendar); `StaffToolbar` passes `true`. This mirrors the existing server side split (`resolveDate({ allowPast })`, spec 0006) instead of inventing a second way to say the same thing. Runner up: two separate wrapper components (`PublicDayNav`, `StaffDayNav`), which would fork a component this spec is explicit about keeping shared (AC-6).
- **The disabled reason reuses `resolveDate`'s own two sentences** (see AC-3) rather than inventing new copy, so the calendar never disagrees with the notice a pasted URL would still show for the same day.
- **The calendar's "today" and "selected" days are set explicitly from `todayInZone(timezone, now)` and the `date` prop**, never left to `react-day-picker`'s own device clock default, which would disagree with the venue's day on a device in another timezone or a long open tab. Month paging is bounded the same way: `endMonth` is the month containing `today + horizonDays` on both boards (nothing past it is ever selectable); `startMonth` is today's month on the public board (nothing before it is ever selectable) and left open on the staff board, which has no past bound.
- **No PostHog event for opening or using the picker.** The existing `board_day_viewed` event already fires from the resulting page view keyed off `?date=`, whichever control produced it (spec 0009). A picker-specific event would tell Ella "how" a day was reached, which nothing in the current allow list or reporting asks for.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**

None. No schema change. The calendar reads props `DayNav` already receives (`date`, `timezone`, `horizonDays`, `now`), which come from the `Schedule` and `StaffSchedule` reads spec 0006 and spec 0007 already built.

**API surface**

None new. The calendar writes the same `?date=YYYY-MM-DD` search parameter the existing arrows write, through the same `href` builder; the page render that follows goes through the existing `resolveDate` → `getSchedule` / `getStaffSchedule` path unchanged.

**Value sourcing**

| Action | Value produced / displayed | Source |
| --- | --- | --- |
| open the calendar | the month first shown | the current `date` prop, parsed in `timezone` |
| open the calendar | which board's rules apply | the new `allowPastPick` prop: `false` from `PublicToolbar`, `true` from `StaffToolbar` |
| render the calendar | which day is marked "today" | `todayInZone(timezone, now)`, passed explicitly; never `react-day-picker`'s own device clock default |
| render the calendar | which day is marked "selected" | the `date` prop, passed explicitly as `selected`; never left to be inferred |
| render the calendar | the earliest month that can be paged to (`startMonth`) | today's month when `!allowPastPick` (public); left unset (no lower bound) when `allowPastPick` (staff) |
| render the calendar | the latest month that can be paged to (`endMonth`) | the month containing `todayInZone(timezone, now)` plus `horizonDays`, both boards |
| render each day | whether it is disabled for being in the past | `!allowPastPick && day < todayInZone(timezone, now)` |
| render each day | whether it is disabled for being beyond the horizon | `daysBetween(todayInZone(timezone, now), day) > horizonDays` |
| render a disabled day | the reason announced | reused verbatim from `resolveDate` (`lib/schedule/queries.ts`): "That day has passed. The board shows today onward." (past) or `` `The schedule only goes as far as ${addDays(today, horizonDays)} for now.` `` (beyond horizon) |
| pick a day | the value written to the URL | the picked day's `YYYY-MM-DD`, read off `react-day-picker`'s local year/month/day fields (never converted through `timezone`, which would shift the day for a device west of it), through the same `href` builder `DayNav`'s arrows already use |
| pick a day | the navigation call | `router.push(href(pickedDate))` (`next/navigation`'s `useRouter`), landing a normal history entry the same as a link click |
| pick a day | when the sheet closes | immediately on a successful pick; `BoardSheet`'s own `onOpenChange` also closes it on Escape or an outside interaction, returning focus to the trigger via `returnFocusTo` |
| pick a day | what the resulting page shows | unchanged: `resolveDate`, `getSchedule` (public, `allowPast: false`) or `getStaffSchedule` (staff, `allowPast: true`), spec 0006 |
| reopen the calendar after a horizon change | the new bound | the fresh `horizonDays` prop the board already re-reads on the `settings_changed` broadcast, spec 0007 AC-11; `DayNav` is never unmounted by this, so an already open calendar updates in place |
| the design gallery entry (AC-8) | the calendar's sample data | the gallery's existing `SAMPLE_TIMEZONE`, `SAMPLE_HORIZON_DAYS` and `date` constants (`app/design/page.tsx`), the same ones its `DayNav` entry already uses; `now` is omitted, matching `DayNav`'s own device clock fallback used only there |

**Key invariants**

1. The calendar never decides what a page shows. It only ever produces the same `?date=` link the arrows already produce; every date is still validated server side by `resolveDate` exactly as before this feature existed.
2. `DayNav`'s existing props (`date`, `timezone`, `horizonDays`, `now`, `className`) keep their existing meaning. The only addition is the optional `allowPastPick`, defaulted so an unmodified caller behaves exactly as before.
3. The disabled bound is derived from props already present on every render; the calendar makes no fetch of its own and holds no state that can go stale independently of the board around it.
4. The calendar's notion of "today" and "selected" always comes from the same `now`/`date` props DayNav already receives, never from the device clock or a library default, so it can never disagree with the day the rest of the board is showing.
5. A day the calendar marks disabled and a day `resolveDate` refuses carry the exact same reason text; the two are never allowed to drift into two different explanations for the same rule.

**Security model**

No change. Reading and writing are unaffected: the calendar is a client side navigation convenience with no new read and no write path. The server side date validation that already enforces the public and staff boundary (spec 0006 AC-2, spec 0007 AC-12) is what actually decides what renders, exactly as it does today.

**Configuration required**

None. No new environment variable or credential.

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):

- Happy path, public: opening the calendar and picking a day 45 days ahead (inside the horizon) navigates to that day, and the resulting URL is identical to one reached by typing the date directly, verifies **AC-1**, **AC-2**.
- Happy path, staff: picking a day six months in the past shows that day's history on the staff board, verifies **AC-1**, **AC-2**, **AC-3**.
- Bounds, public: a day before today and a day beyond the horizon are both rendered disabled, with a reason, and cannot be picked by pointer or keyboard, verifies **AC-3**.
- Bounds, staff: a day beyond the horizon is disabled; every past day, including one from last year, stays pickable, verifies **AC-3**.
- Live horizon change: raising `booking_horizon_days` from 30 to 60 (spec 0007 AC-11) and then reopening an already mounted calendar shows the newly opened days as pickable with no reload and no extra fetch, verifies **AC-4**.
- Regression: the existing `DayNav` unit tests (prev, next, Today, the disabled next arrow at the horizon) pass unchanged, verifies **AC-6**.
- Guard still holds: pasting `?date=` for a day beyond the horizon on the public board still renders the existing "could not be shown" notice, never a bypass introduced by the calendar, verifies **AC-7**.
- Accessibility: tabbing to the trigger, opening with Enter, moving between days (including disabled ones) with the arrow keys, and closing with Escape returns focus to the trigger; contrast checked in both themes, verifies **AC-5**.
- Viewport: the calendar's `BoardSheet` renders from the bottom under 768 pixels and from the right at 768 pixels and above, matching every other sheet in the project, verifies **AC-1**.
- Month paging: on the public board, paging cannot reach a month before today or after `today + horizonDays`; on the staff board, paging past `today + horizonDays` is blocked but paging into the past is unrestricted, verifies **AC-1**, **AC-3**.
- Timezone edge: on a device set to a timezone west of `Asia/Manila` (so its local midnight falls on the venue's afternoon), picking the last enabled day still writes that day's own `YYYY-MM-DD` to the URL, not the day before, verifies **AC-2**.

## Build plan

Tracer Bullet: the first task proves one board end to end (pick a day, land on the right URL) before the bounds and the second board thicken it.

1. [x] Add shadcn's `Calendar` component (`react-day-picker`) through the shadcn CLI, themed to the existing tokens; promote `BoardSheet` and `useMediaQuery`/`WIDE_QUERY` from `components/staff/` to a shared location, updating the four existing staff callers' imports with no behaviour change, satisfies **AC-1** (setup). · found a fifth caller (`details-sheet.tsx`) the spec didn't list; updated it too.
2. [x] The thin thread: a new `components/date-picker.tsx` wrapping `Calendar` inside the promoted `BoardSheet`, taking `date`, `timezone`, `horizonDays`, `now`, `allowPastPick`, with `today`/`selected` set explicitly and `startMonth`/`endMonth` bounded per the Value sourcing table, and the `href` builder factored out of `DayNav`; wired into `DayNav` beside the arrows, navigating with `router.push` on pick. Prove it on the public board: picking a day three weeks out navigates to the matching `?date=` URL, satisfies **AC-1**, **AC-2**, **AC-6**.
3. [x] Bounds and reasons: disable past days on the public board only, disable beyond horizon days on both boards, the disabled reason reused verbatim from `resolveDate`, `allowPastPick` threaded from `PublicToolbar` (omitted, default `false`) and `StaffToolbar` (`true`), satisfies **AC-3**, **AC-4**, **AC-7**.
4. [x] Finish: keyboard and screen reader pass (including disabled days staying reachable and announced via `aria-disabled` and a per day `labelDayButton`), WCAG AA contrast in both themes (fixed a `dark:` override the shadcn generator emitted, caught by the project's own token lint rule), the design gallery's bare `Calendar` entry, and unit tests for the bounds, the month paging limits, the timezone safe date write, and the disabled reasons, satisfies **AC-5**, **AC-6**, **AC-8**.
5. [x] Revision: `/check verify` on the running dev server found the wide sheet's edge to edge height left a large empty gap below the calendar, and the design gallery's bare `Calendar` crashed the page at runtime (a Server Component passing a function `disabled` prop into the client `Calendar` across the RSC boundary, fixed with a serializable `{ before, after }` matcher). Sized the sheet to its content first (`BoardSheet`'s `compact` prop); then, per the engineer's request, added shadcn's `Popover` for wide screens (`components/ui/popover.tsx`, fixing the same generator `cn` import bug found in `calendar.tsx`), anchored to the trigger, sized to its own content, keeping the sheet for narrow only. Satisfies **AC-1**, **AC-5**, **AC-8** under their revised wording.
6. [x] Revision: on a phone, the sheet's calendar sat at its own shrink wrapped width (`w-fit`), off center inside the now full width sheet. `components/ui/calendar.tsx`'s generator code replaced a caller's `classNames` outright instead of merging it, so a caller reaching for `root: "w-full"` would have silently lost every other class on that key; fixed with a small merge helper (`mergeCalendarClassNames`) so a caller can widen one part without fighting or losing the rest. The narrow sheet's calendar now passes `classNames={{ root: "w-full" }}`, filling the sheet edge to edge (the grid and day cells already carried `w-full` beneath the root, so this one change was enough); the popover and the design gallery entry keep the original compact `w-fit` default. Covered by a new unit test asserting the merge. No AC change.

## Consequences

**Positive**

- A day weeks or months away is one pick instead of dozens of taps, for both players planning ahead and staff booking or checking ahead.
- The arrows, the most frequent move, are untouched; this is purely additive to `DayNav`.
- No schema change and no new write path: the server side date validation that already protects the public and staff boundary keeps doing exactly that job, unchanged.
- One shared component change reaches both boards, the same way every other `DayNav` improvement has.
- Reusing `BoardSheet` means the calendar's viewport handling, contrast and focus return arrive already proven, rather than as a second presentation built and tested from scratch.

**Negative / tradeoffs**

- One new dependency (`react-day-picker`) lands in the project for a feature that is otherwise small.
- A full sheet is a heavier presentation than an anchored popover would have been for picking one day; opening the calendar takes over more of the screen than the smallest possible control would, especially on a wide screen where it slides in from the right like a booking form does.
- `BoardSheet` and `useMediaQuery`/`WIDE_QUERY` move out of `components/staff/`, so their four existing callers (`CourtSheet`, `BookSheet`, `EditSheet`, `CloseSheet`) change their import path in the same commit; a mechanical change, but one that touches files this feature does not otherwise need to.
- The calendar shows no signal for a closed weekday or a fully booked day; a picked day can still turn out to be a day with nothing available, discovered only after navigating there. This is a deliberate v1 scope cut (see Decision), not an oversight.

**Neutral**

- `DayNav` gains one new optional prop, `allowPastPick`. Every existing caller (the design gallery, both toolbars before this change) keeps working unchanged because it defaults to `false`, the current effective behaviour for the public board; the staff board's toolbar is updated to pass `true` in the same change that adds the prop.
- `components/ui/calendar.tsx` joins `components/ui/`, shadcn's own generated file, alongside the existing `select.tsx`, `sheet.tsx` and `dialog.tsx`.

## Follow-up

- [ ] `shadcn` is installed (`.agents/skills/shadcn/`, and the project already has `components.json`) but is not listed in root `AGENTS.md`'s `## Agent skills` section, unlike `tailwind-4-docs` or `zod`. Worth adding a line there with `/sync`, since it is already the source for every UI primitive in the project, not just this feature.
- [ ] If Ella wants the calendar to show which days are closed or fully booked, that is its own decision: a weekday-closed shade is cheap (the opening hours are already loaded), but a per day availability shade needs a new aggregate query over `reservation` for the visible month and should go through `/architect` on its own.
- [ ] No scope row currently names this feature; the engineer should confirm whether to enroll it in `docs/scope/scope.md` (see the after-spec confirmation) or fold it into an existing one (feature 6 or feature 7's remaining work).
