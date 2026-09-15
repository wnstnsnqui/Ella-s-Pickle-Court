# 0008. Usage reporting: rationale

The reasoning behind [index.md](index.md). `/develop` does not need this file.

## Context

Ella runs the venue on a feel for when it is busy. The schedule has been recording every booking, closure and cancellation with a start and end since spec 0002, so the facts exist; nobody can see them added up. The scope dropped a separate session history on 2026-09-05 for exactly that reason: the `reservation` table is the history, and this feature is the view over it. Money stays out; the takings and unpaid report is a separate deferred item.

The forces are small and specific. The venue has a handful of courts and, at most, a few hundred bookings a month, so a year of hourly rows is thousands, not millions. The application rule that every local time is `Asia/Manila` means the report must bucket by the venue's day and hour, not the reader's. Opening hours live in one row of `venue_settings` with no history, so any "share of open time" number can only use today's hours. Authorization in this project is enforced in Postgres, and active staff already read every reservation row, so an owner only report needs its own enforcement point rather than a page check.

Two facts the scope asks for are not plain reads today: how much of each hour was booked (a booking may straddle hours or end at midnight), and who cancelled a booking (only the audit trail knows). Not deciding leaves Ella guessing at staffing, and leaves the one report that would justify a change to the opening hours unbuilt while the data quietly piles up.

## Options considered

### Option 1: One `court_usage` function returning hourly minutes, Recharts charts each paired with a hidden table, `cancelled_by` and `cancelled_at` columns, a CSV route beside the page

A plpgsql function does the hour splitting in Postgres and raises unless the caller is an owner; small pure TypeScript functions fold its rows into the three views; Recharts draws them as client components with a visually hidden data table carrying the meaning; a trigger stamps two new columns when a booking is cancelled; a route handler under the page streams the same rows as CSV.

**Pros**

- One query per page load, the heavy part where the data is, the testable part where the tests are.
- Owner only is a Postgres rule, matching every other authorization in the project.
- "Who cancelled" becomes a column any future screen can read; the trigger keeps it right for every cancel path.
- Recharts gives tooltips, axes and responsive sizing without hand rolling them, and the project now has a skill for it.

**Cons**

- A new client dependency on an otherwise dependency light front end, and a theme story to solve for its colours.
- A migration with a backfill, for a fact the audit trail already holds.
- Utilisation uses today's hours for every day, and the page has to say so.

### Option 2: Fetch the rows, split in TypeScript, hand built SVG bars, "who cancelled" derived from the audit trail, no CSV

The lightest build. One select over the range, a pure function splits bookings into hours, three charts are plain SVG rects with Tailwind tokens, and the day list joins the latest cancelling audit row. No migration at all.

**Pros**

- Nothing new in the database, nothing new in `package.json`, theme aware for free.
- Every line of counting logic is a unit test away.

**Cons**

- The whole year of reservation rows crosses the wire on every load, and grows with history.
- Owner only can only be a page check, because staff may already select those rows; the project rule says Postgres is the enforcement point.
- Three charts with tooltips, axes, hover states and responsive widths are more hand rolled UI than they look, and the next chart costs the same again.
- The audit join is a `distinct on` per row that every later screen wanting "who cancelled" would repeat.

### Option 3: A daily rollup table kept by a trigger, three SQL functions, one per bucket

Precompute booked minutes per court, per hour, per day into a rollup table on every insert, update and cancel, and expose three functions that sum it by hour, by day and by weekday and hour.

**Pros**

- The fastest possible read at any scale; the page does no arithmetic.

**Cons**

- A trigger that must stay correct across every edit path, including an owner changing a past booking, plus a backfill, for a venue whose whole history fits in one query.
- Three functions carry the same counting rule three times.
- A stored derived value that goes stale the moment the trigger misses a case, with no measured performance problem to justify it.

## Rationale

Option 1 is the pick, with two of its parts chosen by the engineer against the lighter recommendation, and both are defensible.

The function in Postgres, rather than a TypeScript split, is about where enforcement lives. Active staff can already read every reservation row (spec 0002), so a page redirect alone would leave the aggregate reachable to anyone who knows the row shape. Putting the split in a function that raises unless `private.is_owner()` makes Postgres the enforcement point, which is the project's standing rule. That it also sends a few hundred rows instead of a year of reservations is a bonus, not the reason.

Recharts over hand built SVG was the engineer's call. The recommendation was plain SVG: three simple charts, no dependency, theme aware for free. Recharts costs a client bundle on one owner page and a small amount of theming work, and buys tooltips, axes, responsive sizing and a faster path to the next chart when the takings report arrives. Because the accessibility path is a hidden table either way, the library does not change what a screen reader hears. The trade is fair; the spec keeps the chart presentational so the library can be swapped later without touching the requirements.

The `cancelled_by` and `cancelled_at` columns over an audit derivation were also the engineer's call. The recommendation was to derive from `reservation_audit`, which already holds the fact. The columns cost one migration and a backfill, and in return "who cancelled" is a plain read for this page and any later one, with the trigger keeping it correct for every cancel path rather than only the one Server Action. Spec 0002 chose not to duplicate audit facts into the row; this is a narrow, deliberate exception for the one fact a person asks about by name.

Option 3 is the answer to a scale this venue does not have. A rollup table and its trigger are a maintenance burden with no measured problem behind them, and a stored derived value is exactly what the feature rules warn against.

The utilisation denominator uses today's opening hours and live courts because that is the only honest option without an hours history table. The page says so in one line, and the CSV leaves the percent out so a kept file never carries a number that depends on a setting that later changed. An hours history is a real follow up, not a refusal.

Presets only, no custom dates, was the engineer's call against a recommendation of both. It removes two date fields and their validation from the first cut. The range resolver returns a plain inclusive pair of local dates, so adding custom dates later is a new input into the same shape.
