# Verify: usage reporting · spec 0008 · updated 2026-09-15

_`/debug` fixed the AC-4 defect below on 2026-09-15: `court_usage` is now `security definer` (`20260915130000_court_usage_security_definer.sql`), pinned by `supabase/tests/court_usage.test.ts` (`npm run test:db`). An owner reads real rows; a non owner gets the function's own `42501 Only an owner may read court usage.`, not a raw schema permission error. Confirmed against the real owner and staff accounts on the linked project. The manual UI steps below are unchanged and still open._

_Steps derived from spec 0008 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] Sign in as an active owner, visit `/staff/reports` → the toolbar, four tiles and three chart areas render → AC-1
- [ ] Sign in as a staff (non-owner) account, visit `/staff/reports` → redirected to `/staff` before any report read happens → AC-1, AC-13
- [ ] As that staff account, fetch `/staff/reports/usage.csv` → `403` → AC-9, AC-13
- [x] Signed out, fetch `/staff/reports/usage.csv` → `401` → AC-9. Confirmed by `/check verify` on 2026-09-15: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/staff/reports/usage.csv` → `401`, body `Sign in to download this report.`
- [x] Signed out, visit `/staff/reports` with a browser `Accept` header → the same Clerk dev instance handshake redirect `/staff/settings` gets → AC-1. Confirmed: `curl -H 'Accept: text/html,application/xhtml+xml' http://localhost:3000/staff/reports` → `307` to the Clerk handshake URL, identical in shape to `/staff/settings`'s `307`.
- [ ] Click each preset chip → the URL's `range` changes, `court` is kept, `day` drops, the active chip carries `aria-current="page"` → AC-2, AC-6, AC-11
- [ ] Pick one court in the picker → the tiles and charts narrow to that court, with a one court denominator; pick a retired court → its historical bookings still show → AC-2, AC-5, AC-6
- [ ] Hand count a seeded week's bookings, including one that straddles two hours and one that ends at midnight → compare against the tiles and the by hour chart → AC-4, AC-5, AC-13
- [ ] Hover a bar in each chart and a cell in the heatmap → the tooltip shows booked hours and the utilisation percent → AC-6
- [ ] Click a bar in "Booked hours by day" → the Day section opens below with `day` set in the URL; click Close → the section closes and `day` drops → AC-8
- [ ] Find a cancelled booking in a day's list → the row is struck through, reads "Cancelled" in text, and names who cancelled it and when → AC-8, AC-13
- [ ] Click Download CSV → the file is named `usage-<from>-<to>.csv`, opens as UTF-8 CSV with header `court,date,weekday,hour,booked_minutes`, and its `booked_minutes` sum matches the booked hours tile → AC-9, AC-13
- [ ] Load a range with no bookings (e.g. a future week) → every chart renders at zero with the "No bookings in this range" note, and the tiles read 0 → AC-10
- [ ] Tab through the preset chips, the court `Select`, each chart's hidden data table (including the by day table's date links) and the Day section's Close link → every control is reachable and operable by keyboard, with no focus path into a chart itself → AC-11
- [ ] Check contrast in both light and dark theme, including the heatmap's three shade levels and its Low/Medium/High legend → AC-11
- [ ] Simulate a slow or failing `court_usage` read → one failure notice renders, nothing partial shows → AC-10

## Commands

- [x] `npm run check` → lint, format check, typecheck and the full test suite (332 passed, 22 new in `lib/report/`) → AC-5, AC-7, general correctness
- [x] `npx supabase db advisors --linked` → two `authenticated_security_definer_function_executable` WARNs, one pre-existing (`ensure_staff`) and one expected as of the AC-4 fix (`court_usage`, now `security definer` on purpose, gated by its own owner check) → AC-3, AC-4
- [x] `npm run build` → production build succeeds, `/staff/reports` and `/staff/reports/usage.csv` register as dynamic routes → AC-12
- [x] `DB_TESTS=1 npm run test:db` → `supabase/tests/court_usage.test.ts` (3 new tests): an owner reads rows, a non owner gets the function's own `42501`, anon is refused entirely → AC-4. Fixed 2026-09-15 (see the note at the top of this file); originally failed identically for both the owner and the staff account with `permission denied for schema private` before this fix.

## Acceptance-criteria coverage

- AC-1 (owner gated page, menu link, `noindex`) … covered by the sign in/redirect steps above; the signed-out redirect was confirmed live by curl during the build
- AC-2 (query parameters, `resolveRange`) … covered by the chip and picker steps, plus `lib/report/range.test.ts` (9 unit tests)
- AC-3 (`cancelled_at`/`cancelled_by`, trigger, backfill, constraint) … proven live during the build: real audit-trail data backfilled correctly, `db advisors` clean
- AC-4 (`court_usage` function, owner check, hour split) … met, after the 2026-09-15 fix. `court_usage` was `security invoker`, and `authenticated` has no `USAGE` on schema `private` (deliberately revoked, `20260905043037_court_schedule.sql:166`), so the call failed at `permission denied for schema private` before the owner check ever ran, for every caller including the owner. Table policies calling the same helper were unaffected because they are planned once as the table owner and only need `EXECUTE` at runtime; a plpgsql function body re resolves the schema under the caller's own privileges on every call. Fixed by making `court_usage` `security definer` (`20260915130000_court_usage_security_definer.sql`), the same trick `is_owner()` and `is_active_staff()` already use; the owner check body is unchanged. Pinned by `supabase/tests/court_usage.test.ts`.
- AC-5 (bucket folding, utilisation, denominators) … covered by `lib/report/buckets.test.ts` (13 unit tests: the 100% cap, an hour outside opening hours, a `24:00` close, an empty range) and the court-picker step above
- AC-6 (toolbar, tiles, three charts, tooltips) … covered by the UI walkthrough steps; note the heatmap is a CSS grid rather than a third Recharts chart, per the spec's own Consequences note that the drawing primitive is not pinned
- AC-7 (hour axis widening) … covered by `hourAxis` unit tests and the "out of hours" walkthrough step
- AC-8 (day list, cancelled rows) … covered by the day-list and cancelled-row walkthrough steps
- AC-9 (CSV route, `401`/`403`, RFC 4180) … the `401` path is confirmed live; `403` and the CSV totals check are open
- AC-10 (empty state, loading skeleton, failure notice) … the empty-range note and skeleton are built; the manual failure-notice walkthrough is open
- AC-11 (hidden tables, keyboard, contrast) … built throughout; the manual keyboard and contrast walkthrough is open
- AC-12 (`force-dynamic`, no realtime) … confirmed by the build output listing both routes as dynamic
- AC-13 (live proof on the real project) … open. This is the one item this build could not close: no authenticated owner browser session was available in this environment.
