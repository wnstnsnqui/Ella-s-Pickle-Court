# 0007. Courts and opening hours, the reasoning

The decision record behind [index.md](index.md). `/develop` builds from the index; this file is for a person who wants to know why.

## Context

Ella's Picklecourt has two courts and one row of opening hours, and both were seeded by the first real migration. Everything that has been built since reads them: the public board and the staff board take their columns from `court` and their rows from `venue_settings`, the day navigation stops at `booking_horizon_days`, and the grid's cell labels are derived from the opening hours every time a page is read. There is no screen that changes any of it. Adding a third court or moving the weekend close means the SQL editor in the Supabase dashboard, which the project's own rules say nobody should be using for data, and which no staff member should ever be handed.

Spec 0002 saw this coming and built most of the write side: the `court` and `venue_settings` tables carry `version` and `changed_by`, the policies allow only an owner to touch them, and three Server Actions (`saveCourt`, `retireCourt`, `saveVenueSettings`) already exist with tests, including the rule that a court with future bookings cannot be retired. What is missing is the screen, plus three things that only became visible when the screen was designed. First, nothing stops two live courts from sharing a name, which would make the grid unreadable. Second, `sort_order` is unique among live courts through a partial index, so swapping two courts cannot be done as two plain updates, and `saveCourt` handles one court at a time. Third, only `reservation` has a broadcast trigger. A booking reaches every open board within a second; a renamed court or a shortened day reaches nobody until they reload or the slow poll fires, and the scope for this feature says both boards reflect every change straight away.

There is also the matter of midnight. `localTimeSchema` stops at `23:59`, which nobody noticed while the hours were seeded, and which the first hours form would surface at once for a venue that closes late.

The forces are small and clear. The owner is one person on a phone or a tablet, using this page a few times a year. Staff must not be able to reach it, and Postgres must be what says so. The boards already have a listener that refetches the day on any nudge, so a live update is cheap if the nudge exists. And every write that changes state in this project is conditional on a version, which the settings page has to honour like everything else. Not deciding leaves Ella with the SQL editor, and leaves feature 8 on the scope with three load bearing gaps for the build to guess at.

## Options considered

### Option 1: One page at `/staff/settings`, up and down buttons, a one transaction reorder function, and two more events on the `schedule` topic

A single scrolling page under the existing `/staff/` protection: the live courts with Add, Edit, Move up, Move down and Retire; the hours form; and a collapsed list of retired courts with Restore. Reorder sends the whole list to a new Server Action that calls a Postgres function doing the swap in one transaction. A shared trigger on `court` and `venue_settings` sends `court_changed` and `settings_changed` on the private `schedule` topic the boards already listen to, and the listener hook adds those two events. One migration carries the unique name index, the midnight check, the function and the trigger.

**Pros**

- Everything reuses what the staff board proved: the shell, the sheet and dialog patterns, react-hook-form with Zod, the toast, the listener hook. No new library.
- The reorder can never leave a half applied order on the grid, because it is one transaction inside a function that row level security still governs.
- One topic, one policy, one subscription per board. The boards learn two event names and nothing else.
- Up and down buttons work with a thumb, a keyboard and a screen reader with no extra code.
- The unique name lives in Postgres, so two owners at once cannot slip a duplicate through.

**Cons**

- Up and down is a press per position. Fine at six courts, tiresome at twenty.
- A Postgres function is one more object to keep in the migration history and to test.
- The settings page itself is not live. Two owners editing at once meet on save, not while typing.

### Option 2: A sheet from the staff board, a two round trip reorder from the Server Action, and no trigger

The simplest thing: a Settings sheet opened from the staff board toolbar, with the court list and the hours form inside it. Reorder parks the moved courts at temporary orders in one update and writes the final orders in a second. No migration at all; the boards pick up a change on the slow poll, on focus, or on the next reload.

**Pros**

- No schema change, so no migration to review and no `db advisors` run.
- Ella never leaves the board.
- Least code by a wide margin.

**Cons**

- Not atomic. A failure between the two reorder updates leaves negative orders on the grid, and the grid sorts by them.
- A court list with reorder controls plus a six field hours form does not fit a sheet on a phone without a lot of scrolling inside a scroll.
- Misses the scope line that both boards reflect every change straight away. A renamed court sits wrong on a player's phone until the poll fires.
- Duplicate names are still possible.

### Option 3: Two pages, drag and drop, and a separate `schedule_meta` topic

`/staff/courts` and `/staff/hours` as separate pages, each with its own menu link. Courts reorder by drag handles with `@dnd-kit`, with a keyboard fallback. Court and settings changes broadcast on a second private topic so the reservation stream stays untouched, and the boards open a second subscription.

**Pros**

- Drag is the nicest reorder on a desktop and the one people expect.
- Two focused pages are each simpler than one long one.
- The reservation broadcast keeps a single purpose.

**Cons**

- A new library and its keyboard and screen reader story, for a list of two to six items, on a page used a few times a year. Drag on a phone also fights the page scroll.
- A second topic means a second `realtime.messages` policy, a second `subscribe()` with its own reconnect and `setAuth()` path in every board, and a second thing to get wrong.
- Two pages, two loading states, two links, for one owner.

## Rationale

Option 1 is the one that fits the venue and the codebase as they are. The scope's requirement that both boards reflect a change straight away is the force that rules out Option 2: the listener hook exists, the private topic exists, and the only missing piece is the database sending a nudge, which a trigger in the style of `reservation_broadcast()` gives for a few lines of SQL. Once a migration is needed anyway, the unique name index and the midnight check ride along at no extra cost, and putting the reorder in a function is what makes it safe: the partial unique index cannot be deferred, a deferrable constraint cannot be partial, and two updates from the application are two chances to leave the grid half sorted. Row level security still applies inside the function because it is `security invoker`, so the project's rule that authorization is a policy and never an `if` holds.

Option 3 was the tempting one, and each of its parts is a reasonable choice on a different project. Here the owner is one person with a phone, the court count is single digits, and every extra moving part (a drag library, a second topic, a second page) is something to operate for no gain the venue would feel. Up and down buttons are the boring answer, they are accessible for free, and they send the same whole list `reorderCourts` would receive from a drag, so nothing is closed off.

Two of your choices went against my first suggestion and both are right for the reasons you gave. Redirecting a non owner to `/staff` instead of showing the settings read only means a staff member cannot check the hours on this page, but it also means one fewer state to build and test on a page they have no business on, and the hours are visible on the grid anyway. And keeping the settings page off the live channel is a deliberate trade: a page open a minute a month does not earn a second listener variant, and the version check catches the one collision that matters.

The midnight close is included because the form is what makes the gap visible. Leaving it in Deferred would ship a form that refuses the single value a late night venue is most likely to type.

---

# Revision, 2026-09-22: opening hours per day of the week

## Context

The venue stays open until midnight on a Friday night and closes earlier on the other weekdays. The hours model cannot say this. `venue_settings` holds one pair of times for weekdays and one pair for weekends, and every read decides which pair applies by asking `isWeekend(date)`, which answers Saturday or Sunday. Friday is therefore Monday, and the grid shows Friday closing when the venue is still full.

The gap is not the midnight handling. `24:00` has been a legal closing time since this spec shipped, and `closeTimeSchema`, `zonedTimeToUtc` and `formatSlotLabel` all carry it correctly. The gap is the two bucket model itself: weekday and weekend is a guess about how venues run, and this venue does not run that way. Nothing else does either, in the end, which is the usual fate of a bucket.

Three forces shape the answer. The first is blast radius: the four columns are read in nine places across the grid, the stranded booking count, the usage report, the JSON-LD block, the analytics schema and the settings form, so whatever replaces them has to be adopted by all of them at once or leave a path that is right six days a week. The second is that a day being closed has never been expressible either, and it is the same shaped hole; Ella works around it today with a full day closure on every court, which the usage report then counts as time that was open and empty. The third is that this venue is one site with a handful of staff and a single deployment, so the operational budget for a careful multi phase migration is not there and does not need to be.

Not deciding means the special case moves into somebody's head. Staff would learn that Friday's grid is wrong after 22:00 and book around it, which is exactly the state the board was built to end.

## Options considered

### Option 1: A `venue_hours` table, one row per day of the week

Replace the four columns with seven rows keyed by `day_of_week`, where a row with both times null means closed all day. Every read looks up the date's own day instead of asking whether it is a weekend. The week is written by one Postgres function in one transaction, guarded by `venue_settings.version`.

**Pros**:

- The model matches the domain exactly. A venue's opening hours are a weekly pattern, and that is what is stored, so no read has to infer anything.
- One question with one answer replaces a bucket, and the three `isWeekend()` branches collapse into one lookup.
- Closed days come almost free, as the absence of times rather than a new concept, and that retires the closure reservation workaround.
- It is data, not columns, so a query can join it, the report can eventually compute open minutes in SQL, and a date keyed override table for holidays hangs off the same shape later.
- Postgres keeps enforcing the invariants: the paired null check, the close after open check and the revoked `insert` and `delete` are all constraints rather than application rules.

**Cons**:

- Every schedule read gains a second query and a second thing that can fail, where before the hours came free with the settings row.
- The form goes from four selects to seven rows, which is more work for a venue whose weekdays really do all match.
- The week has to be written atomically, which means a Postgres function rather than a plain update, so there is more SQL to write and test.
- It is a table for seven rows that will never be six or eight, which reads as heavier than the thing it holds.

### Option 2: Fourteen columns on `venue_settings`

Keep the singleton row and give it `monday_open` through `sunday_close`. No new table, no join, and the existing single row read and version check keep working untouched.

**Pros**:

- The smallest change to the read path: one row still carries everything, so no query, no join and no atomicity problem, since a single row update is already atomic.
- The existing version and `changed_by` machinery applies with no new function at all.
- Fastest to build, by a clear margin.

**Cons**:

- Fourteen columns for what is plainly a list, and closed days need all fourteen nullable plus seven paired check constraints written out by hand.
- Nothing can join it or aggregate it, so the report's open minutes stay in TypeScript permanently rather than becoming a SQL option later.
- Every consumer hardcodes seven column names, so the mapping between a date's day number and a column name is written out repeatedly and is a fresh chance to get an off by one wrong.
- A date keyed override table has nothing to hang off, so holidays would be a second unrelated design rather than an extension of this one.

### Option 3: Keep the pairs, add a Friday column

Add `friday_open` and `friday_close` beside the existing four, and have `openingHours()` check for Friday before it checks for the weekend.

**Pros**:

- Genuinely the smallest possible change, and it solves the stated problem today.
- Nothing already shipped has to move, so the risk is close to zero.

**Cons**:

- It encodes the accident rather than the rule. The model still says days come in categories, with Friday now a third one, and the next request reopens the same file.
- The lookup becomes a three way branch ordered by specificity, which is the shape that grows a fourth and fifth arm.
- Closed days remain unexpressible, so the workaround stays and the report stays wrong about it.

### Option 4: A `jsonb` column holding the seven pairs

One `hours jsonb` column on `venue_settings` carrying the week as a document.

**Pros**:

- A single read and a single atomic write, with no new table and no function.
- The shape can change later without a migration.

**Cons**:

- Postgres stops checking anything. The paired null rule, the close after open rule and the seven day cardinality all move into application code, which is directly against this project's rule that Postgres is the enforcement point and an `if` in a Server Action is not authorization or validation.
- A malformed document is storable, so a bad write is discovered by a board rendering wrong rather than by a constraint refusing it.

## Rationale

Option 1 because the force that actually decides this is the blast radius, not the build cost. Nine call sites have to change no matter which option wins, so the question is what they change to, and the only answer that stops this coming back is the one where the stored model is the real model. Option 3 is the tempting one at the moment of asking, since Friday is the only day that differs today, but it writes the exception into the schema and leaves the next one homeless. The venue already has a second unexpressible case sitting in front of us, the closed day, which is the evidence that the category based model keeps failing rather than a hypothetical about the future.

Option 2 is the honest runner up and it would work. It is rejected on the second force: the report and the stranded booking count both want to reason about hours in bulk, and a table can eventually answer that in SQL while fourteen columns never can. The Deferred scope item about moving the outside hours count into SQL, and the one about recording an hours history, both get easier with a table and harder with columns. The cost of the extra query is one round trip on a page that already makes several, which is the cheapest thing being traded here.

The atomicity decision follows from the same place. A week is one edit in Ella's head, one Save button on screen, and so it should be one transaction in the database; anything less makes a half saved week representable, and a half saved week is a grid that is wrong in a way nobody can see. Guarding it with `venue_settings.version` rather than a version per row is the same reasoning applied to concurrency: one lock for one edit. It does mean an unrelated slot length change bumps the version an hours edit is checking, which is a real if small cost on a page two owners will almost never have open at once.

The migration is a big bang, which goes against the usual instinct and against this mode's own default. The strangler pattern needs the old and the new to coexist usefully, and here they cannot: keeping the four columns in sync with the seven rows during an overlap means a trigger holding two truths together, and any read still on the old columns is correct six days a week and wrong on Friday, which is the bug. One site, one deployment and three call sites for `openingHours()` is the situation where dropping the columns in the same migration is the safer choice, because it makes a stale read impossible instead of merely unlikely.

Your two calls that went against the obvious symmetric answer are both right. Letting staff book on a closed day, through a deliberate button rather than a grid, matches what actually happens at a venue: the tournament gets booked and nobody wants to phone Ella about it. It also costs nothing to allow, because neither the action nor Postgres has ever refused a booking for being outside hours, so closed was always going to be advisory whatever the UI said. And having the two boards differ on a closed day is worth the inconsistency, because they answer different questions: a player wants to know whether to come, a staff member needs a page that does not invite a click on a day that is shut.
