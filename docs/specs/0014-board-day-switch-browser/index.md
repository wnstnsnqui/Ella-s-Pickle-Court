# 0014. Board day switch read in the browser

**Date**: 2026-09-26
**Status**: Accepted

## Summary

Changing day on the public board (`/schedule`) and the staff board (`/staff`) stops rendering the whole page again on the server. Instead the board reads the new day in the browser, the way the landing page's booking section does. While it loads, the old day stays on screen dimmed and only the pressed control spins, exactly as today. A read that fails is retried quietly a few times before anyone is told. The address bar quietly follows the day on screen (no reload, no new back button step), so a reload or a shared link still shows the right day. The first visit, a pasted link and a reload are still rendered on the server.

## Requirements

**User stories**

- As a player, I want the next day to appear quickly when I tap the arrow, so that checking the week is not a wait per day.
- As a staff member, I want to flick between days without the page reloading, so that I can find a free slot while someone is on the phone.
- As a player, I want a shaky connection to be retried for me, so that one dropped request does not become an error.
- As a player, I want the address I copy to show the day I am looking at, so that my group sees the same day.

**Acceptance criteria**

- **AC-1**: On `/schedule` and `/staff`, a `DayNav` arrow tap or calendar pick reads the new day in the browser through that board's existing transport: `GET /api/schedule?date=` on the public board, the `refreshStaffSchedule` Server Action on the staff board. No router navigation happens: no page render on the server and no RSC request for the page. The channel stays joined (no unsubscribe and resubscribe).
- **AC-2**: While a day read is pending, the spec 0003 day switch look holds: the heading shows the target day at once, only the control that was pressed spins, the other day controls are disabled, and the grid of the day still on screen is dimmed with `aria-busy`, with pointer events off. The live indicator is unaffected.
- **AC-3**: Only the newest day read lands. Each tap supersedes the one before; a slower older answer is dropped, and the quiet retries of a superseded read stop.
- **AC-4**: When a day lands, `history.replaceState` sets `?date=<landed day>` on the current path, keeping any other search parameters. When the landed day is venue today, `date` is removed instead. No history entry is added, so Back leaves the board as it would from any single page. A reload or a copied address shows the day on screen.
- **AC-5**: A transient failure (a network error, a `5xx`, or the staff `failed` kind) is retried after 1, 2 and 4 seconds with nothing new on screen: the grid stays dimmed and the control keeps spinning. When the retries run out, the heading and controls snap back to the day still on screen, the grid undims, and one toast reads "Couldn't load <day heading>." with a "Try again" action that repeats the same day change. The failure is reported the way failed reloads already are (`console.error` and `captureBrowserException`).
- **AC-6**: Failures that are not transient are never retried. A `429` shows "Too many requests. Try again in N seconds." (N from `Retry-After`), sets the read gate's wait, and snaps back as in AC-5 with no Try again action. An `out_of_range` answer on a day change (reachable only when the horizon shrank after the page loaded, since `DayNav` bounds the pick) snaps back with the toast "That day is past the booking window." Any other failure the transport marks `retry: false` (on the staff board, every `ActionError` kind but `failed`) snaps back and shows the action's message. A day tap during an active `429` wait is refused at once with the same toast and no read.
- **AC-7**: Per day state resets when a new day lands, exactly as the remount did: the staff selection, pending cells, failed cells and any open sheet are cleared; the changed cell highlight never fires across a day change (it compares only two reads of the same `grid.date`); the scroll to the now marker runs once when the landed day is venue today; `board_day_viewed` fires once per landed day.
- **AC-8**: Live reads and day reads never collide. While a day read is in flight, triggers from the read gate (a broadcast, a poll tick, the tab becoming visible, the channel recovering, the minute tick) are held, and one read runs after the day lands, for the landed day. After a day lands, every later re read asks for that day. A day read counts as the gate's last read for the 2 second floor.
- **AC-9**: The board follows the venue's day (spec 0006, AC-10) exactly when its URL carries no `date`: after a first visit with no date, or after landing on today by navigation. A board whose landed day is any other date stays on it.
- **AC-10**: On the public board, when a day lands, `document.title` becomes the same text `generateMetadata` produces for that URL: `Court schedule for <day> · Ella's Pickle Court` when dated, the root layout default when not. The staff board's title (`Staff schedule`) names no day and is unchanged.
- **AC-11**: Hard loads are unchanged: a first visit, a pasted link, a reload or a link from another page is rendered on the server per request, with the route skeleton (`app/schedule/loading.tsx`, `app/staff/loading.tsx`). The staff board's existing `out_of_range` recovery on a live re read (spec 0007, AC-12) shows today by an in browser read of today plus the AC-4 URL update, not `router.replace`.
- **AC-12**: The landing page behaves exactly as spec 0013 says: its five quiet retries (1, 2, 4, 8, 16 seconds) and its message card are unchanged. It and the boards share one retry helper with different delay lists.
- **AC-13**: A navigation from outside the hook that changes `date` in the address is followed in the browser, like a tap. The hook reads `date` through `useSearchParams`; when it differs from the last `date` the hook itself wrote, somebody navigated (for example the staff menu's `/staff` link from a dated day, which Next may answer with the page it first rendered, so no fresh `initial` arrives), and that day is read through the same path as AC-1 to AC-6, with no `date` meaning venue today. The hook's own `replaceState` writes are recognised as its own and never trigger a read. When a navigation does bring a fresh server render (a new `initial`), that render wins, as the old remount did. _Added 2026-09-29: found while building, after the first cut read nothing back from the address._

## Decision

**Chosen option**: Option 2: Read the day through the board's own transport, URL replaced quietly.

`useScheduleChannel` owns the day on screen and the pending day, `DayNav` is driven by the board, and a landed day replaces the URL without a history step.

**Implementation skills**: `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `playwright-cli` (`microsoft/playwright-cli`, `.agents/skills/playwright-cli/`) · `accessibility` (`.agents/skills/accessibility/`, for `aria-busy` and the snap back)

The RECOMMEND items settled here, each with the pick and the runner up:

- **The hook owns the day.** `useScheduleChannel` holds `date` (the landed request date, `undefined` meaning today) and `pendingDate` as state, initialised from the server render, and exposes `goToDay(date: string)`. Picking venue today sets `date` to `undefined`, which is what keeps midnight following (AC-9). Runner up: the day in the provider, which would have to tell the hook anyway.
- **The gate pauses while a day read is pending.** `ReadGate` gains `pause()` and `resume()`. A trigger while paused only sets `wanted`; `resume()`, called when the day lands or snaps back, runs one read (subject to the window and floor as usual) if anything was wanted. This is how AC-8 holds triggers. Runner up: dropping triggers during a day read and hoping the next one comes, which loses a booking made in that second.
- **A day read skips the 300 ms window and the 2 second floor, but not a `429` wait.** A tap is a person asking; it is not a burst to coalesce. It bumps the generation (AC-3) and marks the gate's `lastReadAt` when it starts. Runner up: sending taps through the gate, which would make a second quick tap wait up to two seconds.
- **`TransportResult` failures say whether to retry.** The failure branch gains `retry: boolean`: the public transport sets it for a thrown `fetch` and any `5xx`; the staff transport for a thrown call and the `failed` kind. Everything else sets `false`: `429` (already `retryAfterMs`), `422`, and every other `ActionError` kind (`invalid` including `out_of_range`, `unauthenticated`, `forbidden`, `not_found`, `conflict`). Runner up: guessing from the message, which is how a permission error gets retried.
- **One retry helper.** `lib/schedule/quiet-retry.ts` exports a pure `withQuietRetries(attempt, { delaysMs, sleep, cancelled })` that runs `attempt()`, retries while the result says `retry`, and stops at once when `cancelled()` is true. `components/landing/read-day.ts` is rewritten on it with `LANDING_RETRY_DELAYS_MS` (unchanged); the boards use `BOARD_RETRY_DELAYS_MS = [1_000, 2_000, 4_000]`. Runner up: the landing page's 31 seconds of retries, which is far too long to hold a working board dimmed.
- **`DayNav` becomes controlled.** It takes `onNavigate(date)` and `pendingDate` in place of its own `router.push` and `useTransition`; `onNavigatingChange` is removed. Both contexts derive `dayNavPending` as `pendingDate !== undefined` from the hook, and `setDayNavPending` is deleted. The `date` or `requestedDate` prop each provider gets from its page becomes the hook's initial value only; the context's `date` is the hook's live one, and the wrapper hooks (`use-public-schedule.ts`, `use-staff-schedule.ts`) read the live `date` from `useScheduleChannel`, never the page prop, including the midnight check. Its pending look (heading jump, per control spinner, disabled controls) is driven by `pendingDate` and which control set it. `/design` passes local state. Runner up: keeping a router fallback inside `DayNav`, which is two code paths for one control.
- **Per day state resets by key, below the hook.** The pages no longer key the providers on the server's `grid.date`. Instead each provider renders its children inside a small `DayBoundary` (`components/schedule/day-boundary.tsx`, a client component) that reads the landed `schedule.grid.date` from the provider's context and renders `<Fragment key={date}>{children}</Fragment>`, so the board body (grid, staff selection and sheets, `BoardDayViewed`) remounts when a new day lands while the hook and its channel above it do not. `BoardDayViewed` moves inside the boundary and reads the day from context instead of a server prop. `useChangedCells` treats a changed `grid.date` as a new baseline, not a diff. Runner up: resetting each piece of state in an effect, which is a list somebody will forget to extend.
- **The URL is written only when a day lands, never on tap.** So the address never names a day that is not on screen. The write is `window.history.replaceState(null, "", url)`, which Next 16 integrates with `useSearchParams` (`node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md`, "Native History API"). The hook does read `date` back through `useSearchParams`, but only to follow a navigation it did not make (AC-13): a `written` ref holds the last `date` it put in the address, and a value equal to it is its own write, so the write cannot loop. _Revised 2026-09-29: this first said nothing reads `date` back, which left a link to the board it is on showing the old day._
- **The title shares one helper.** A pure `boardTitle(date?: string)` in `lib/schedule/` returns what `generateMetadata` uses, and the public board sets `document.title` from it on land. Runner up: leaving the title stale, which a shared tab shows.
- **Snap back is the failure state, not an error panel.** A day that could not be read never replaces the grid; the day on screen stays and is honest about which day it is. The toast carries the retry. Runner up: the error state with Retry, which throws away a perfectly good grid.

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**

No schema change, no new endpoint. `TransportResult`'s failure branch gains `retry: boolean`.

**State transitions**

Per board: `idle` → (tap) `pending(date, source control)` → `idle` with the new day landed, or → (retries spent or not retryable) `idle` with the old day and a toast. A newer tap in `pending` replaces the pending date and source. Gate triggers during `pending` are held by `ReadGate.pause()` and replayed once by `resume()` (AC-8).

**API surface**

No new surface. Used as is: `GET /api/schedule?date=` (spec 0006) and `refreshStaffSchedule({ date })` (spec 0005).

**Value sourcing**

| Action           | Value produced / displayed                 | Source                                                                                                   |
| ---------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| tap              | the target day                             | `DayNav`: `addDays(date, ±1)` or the calendar pick, bounded as today (spec 0003, 0011)                   |
| tap              | today (to decide undated)                  | `todayInZone(grid.timezone, now)` with `now` from the landed schedule (spec 0006, AC-4)                 |
| pending          | which control spins                        | the source recorded by `DayNav` with `pendingDate` (prev, next or calendar)                              |
| pending          | the heading                                | `pendingDate ?? grid.date`, formatted as today                                                           |
| read             | the day's schedule                         | the board's transport: `GET /api/schedule?date=` (public), `refreshStaffSchedule` (staff)                |
| read             | whether to retry                           | `TransportResult.retry`, set per transport as in Decision                                                |
| read             | retry delays                               | `BOARD_RETRY_DELAYS_MS` = 1, 2, 4 s in `lib/schedule/quiet-retry.ts`                                     |
| read             | whether an answer may land                 | the hook's generation counter                                                                            |
| `429`            | N seconds in the toast, the wait           | `Retry-After` via `retryAfterMs`, default 5 s as today                                                   |
| land             | the URL                                    | current `location.pathname`, current search params with `date` set to `grid.date`, or removed when `grid.date` is venue today |
| land             | the tab title (public)                     | `boardTitle(date)` in `lib/schedule/`, shared with `generateMetadata`                                    |
| land             | the per day remount                        | `DayBoundary` keyed on the context's `schedule.grid.date`                                                |
| land             | `board_day_viewed` days ahead              | `BoardDayViewed` on the remounted body, unchanged (spec 0009)                                            |
| failure          | the toast text                             | `formatDayHeading(pendingDate)`; the Try again action calls `goToDay(pendingDate)`                       |
| failure          | the report                                 | the existing reload failure reporting in `use-schedule-channel.ts` plus `captureBrowserException`        |
| outside nav      | the day to read                            | `useSearchParams().get("date")` in `useScheduleChannel`, when it differs from the hook's `written` ref; absent means venue today (AC-13) |
| midnight         | whether to follow the venue's day          | the hook's `date === undefined` (AC-9)                                                                   |

**Key invariants**

1. One reader per board. Every read, day or live, goes through `useScheduleChannel`; nothing else calls a transport.
2. Only the newest read lands, and a superseded read's retries stop.
3. The URL and the title name the day on screen, never the pending day.
4. A failed day read never removes the grid on screen.
5. The channel is never torn down by a day change.
6. Staff reads still go through the Server Action, so `requireStaff()` runs first on every one.

**Security model**

Unchanged. The public board reads through `GET /api/schedule` on the anon client (four columns, spec 0002); the staff board through its Server Action with `requireStaff()` and row level security. Day taps are public reads and spend the shared 60 a minute budget in `proxy.ts`; with no prefetch, that is one read per landed tap plus at most three retries.

**Configuration required**

None.

**Critical test scenarios**

- Happy path: on `/schedule`, tapping next fires one `GET /api/schedule?date=<tomorrow>` and no document or RSC request, the grid dims, the right arrow spins, tomorrow lands, the URL reads `?date=<tomorrow>` with `history.length` unchanged, and the title names the day, verifies **AC-1**, **AC-2**, **AC-4**, **AC-10**.
- Staff: on `/staff`, select two cells, tap next: `refreshStaffSchedule` is called, the selection is gone when tomorrow lands, and the channel was not resubscribed, verifies **AC-1**, **AC-7**.
- Racing: three next taps in quick succession with the first answer slowest; only the third day lands and the first read's retries stop, verifies **AC-3**.
- Retries: the transport fails twice then succeeds (fake timers): reads at 0, 1 and 3 s, then the day lands with no toast; failing four times snaps back with one toast whose Try again repeats the change, verifies **AC-5**.
- Not retried: a `429` with `Retry-After: 9` gives no retry and the "9 seconds" toast, and a tap within those nine seconds makes no request; a staff `forbidden` gives no retry, verifies **AC-6**.
- Collision: a broadcast arriving during a pending day read makes no read until the day lands, then exactly one read for the new day, verifies **AC-8**.
- Today: navigating back to today removes `date` from the URL and the board then follows midnight; a board on tomorrow does not, verifies **AC-4**, **AC-9**.
- Highlight and analytics: landing a new day highlights no cell and captures `board_day_viewed` once, verifies **AC-7**.
- Hard load: a reload on `/schedule?date=<tomorrow>` renders on the server with the skeleton, verifies **AC-11**.
- Outside navigation: on `/staff?date=<tomorrow>`, following the staff menu's `/staff` link reads today in the browser and lands it with `date` removed; a tap that lands a day and writes `?date=` makes no second read from the address change, verifies **AC-13**.
- Landing: the landing page's retry tests pass unchanged on the shared helper, verifies **AC-12**.

## Build plan

Tracer Bullet: prove one tap reading in the browser on the public board end to end, then bring the staff board onto the same path, then the failure handling, then the edges.

1. [x] The thin thread on the public board: `goToDay`, `date` and `pendingDate` in `useScheduleChannel` (skipping the window and floor, bumping the generation, holding gate triggers while pending); `DayNav` controlled by `onNavigate` and `pendingDate`, with its router and transition code removed and `/design` on local state; `ReadGate.pause()`/`resume()`; `components/schedule/day-boundary.tsx`; `PublicScheduleProvider` no longer keyed, its children and `BoardDayViewed` inside the boundary, `dayNavPending` derived and `requestedDate` replaced by the hook's live `date`; `replaceState` on land with `date` removed for today. Prove it in a browser: one `/api/schedule` request per tap, no RSC request, and after a `replaceState` a reload, `useSearchParams` and the next tap all agree on the landed day (no desync with Next's router), satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-8**, **AC-9**.
2. [x] The staff board on the same path: `StaffScheduleProvider` no longer keyed, its body (selection, pending and failed cells, sheets) inside the `DayBoundary`; `dayNavPending` and `date` from the hook in `StaffScheduleContext`; the `out_of_range` recovery reads today in the browser instead of `router.replace`; `useChangedCells` gets an explicit `before.date !== after.date` guard that rebaselines instead of diffing, satisfies **AC-1**, **AC-7**, **AC-11**.
3. [x] Quiet retries: `lib/schedule/quiet-retry.ts` with its tests; `read-day.ts` moved onto it with its tests passing unchanged; `retry` on both transports; the snap back and the one toast with Try again; the `429` toast and refusal during a wait; the non retryable kinds, satisfies **AC-5**, **AC-6**, **AC-12**.
4. [x] Title and the rest: `boardTitle()` shared by `generateMetadata` and the public board's `document.title`; `BoardDayViewed` once per landed day and the now marker scroll once on today, checked on the remounted body, satisfies **AC-7**, **AC-10**.
5. [ ] Amend the older specs (spec 0003 "Day switch loading" and "The selected day", spec 0005's day navigation, spec 0006 AC-10 and AC-12) to point here (_done 2026-09-29_); hook and component tests for every scenario above; `npm run check` green; a real browser pass on both boards including a throttled network, a forced `500` and the staff menu's `/staff` link from a dated day, satisfies every AC above.

## Consequences

**Positive**

- A day change costs one small read instead of a page render, on both boards, and the channel stays joined.
- One dropped request no longer shows as a failure.
- The address bar and the title always name the day on screen.
- The landing page and the boards share one retry helper, so a fix lands on all three.

**Negative / tradeoffs**

- Back no longer steps through days; it leaves the board. The engineer chose this for parity with the landing page.
- Per day state now resets by a key below the hook rather than by a remount of everything. Anything new that belongs to a day must live under that key.
- `DayNav` loses its standalone router behaviour; every caller now owns the day.
- A tap on the public board spends a public read from the shared 60 a minute budget, as before. A burst of taps with retries could spend more of it than a navigation did, since retries are new.

**Neutral**

- Hard loads (first visit, pasted link, reload) keep the server render and the route skeleton.
- The live re read path (broadcast, poll, focus) keeps its current failure handling; quiet retries apply to day changes only.

## Follow-up

- [ ] If players want Back to step through days, switch the land step from `replaceState` to `pushState` and read the day from `popstate`; the rest of this design holds.
- [ ] Consider applying the quiet retries to live re reads too, replacing the immediate "The board could not reload" toast; left out here because the slow poll already recovers.
- [ ] Prefetching the neighbouring days would make taps instant but would spend the public read budget; revisit only with real usage numbers (spec 0009).
