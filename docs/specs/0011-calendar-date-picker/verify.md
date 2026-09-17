# Verify: calendar date picker · spec 0011 · updated 2026-09-17

_Steps derived from spec 0011 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] On the public board, tap the "Pick a date" button next to the arrows → the calendar opens as a popover anchored to the trigger at 768px and above, sized to its content; from the bottom in a sheet under 768px → AC-1
- [ ] On the public board, pick a day 3 weeks ahead (inside the horizon) → the popover/sheet closes and the URL becomes `?date=` that day, identical to typing it directly → AC-2
- [ ] On the staff board, pick a day 6 months in the past → that day's history renders on the staff board → AC-1, AC-2, AC-3
- [ ] On the public board, a day before today and a day beyond `today + booking_horizon_days` are visibly disabled, cannot be picked by click or keyboard, and each carries its own reason (past vs. horizon) when read by a screen reader → AC-3
- [ ] On the staff board, a day beyond the horizon is disabled; a day from last year is still pickable → AC-3
- [ ] As an owner, raise `booking_horizon_days` from 30 to 60, then reopen an already-mounted calendar without reloading → the newly opened days are pickable → AC-4
- [ ] Tab to the "Pick a date" trigger, open with Enter, move between days (including disabled ones) with arrow keys, close with Escape → focus returns to the trigger, on both the popover (wide) and the sheet (narrow) → AC-5
- [ ] Check contrast of the trigger and the open popover/sheet in both light and dark themes → AC-5
- [x] The existing prev/next arrows and the Today link still work exactly as before on both boards → AC-6 · confirmed 2026-09-17 against the running dev server, real HTML on `/` for both today and `?date=2026-10-01`
- [x] Paste `?date=` for a day beyond the horizon directly into the address bar on the public board → the existing "could not be shown" notice still renders, no bypass → AC-7 · confirmed 2026-09-17, `GET /?date=2099-01-01` still renders the notice and the horizon sentence
- [x] On `/design`, the bare `Calendar` renders next to the `DayNav` entry (not inside a sheet), with a disabled day visible, in both themes → AC-8 · confirmed 2026-09-17 only after a fix: the gallery originally crashed this section at runtime (a Server Component passing a function `disabled` prop into the client `Calendar`); fixed by switching to a serializable `{ before, after }` matcher, then reconfirmed live
- [ ] On a device set to a timezone west of `Asia/Manila` (e.g. `America/Los_Angeles`), pick the last enabled day → the URL carries that day's own date, not the day before → AC-2

## Commands

- [x] `npm run check` → lint, format check, typecheck, and the unit suite (including `lib/time.test.ts` and `components/date-picker.test.ts`) all pass → AC-2, AC-3, AC-6 · confirmed 2026-09-17, 55 files / 435 tests passing

## Acceptance-criteria coverage

- AC-1 (trigger + sheet, bounded paging) … covered by the first UI step, and the month-paging unit tests in `components/date-picker.test.ts`
- AC-2 (navigates to the matching `?date=` link, timezone-safe) … covered by the second and last UI steps, and the round-trip tests in `lib/time.test.ts`
- AC-3 (disabled days, reasons, aria-disabled not native disabled) … covered by the fourth and fifth UI steps, and `isDayDisabled`/`disabledReason` unit tests
- AC-4 (bound follows a live horizon change) … covered by the horizon-raise UI step
- AC-5 (keyboard, screen reader, contrast) … covered by the keyboard and contrast UI steps
- AC-6 (arrows/Today unchanged) … covered by the arrows UI step and the unchanged assertions in `app/design/page.test.ts`
- AC-7 (no new bypass; server still validates) … covered by the paste-URL UI step
- AC-8 (design gallery entry) … covered by the `/design` UI step
