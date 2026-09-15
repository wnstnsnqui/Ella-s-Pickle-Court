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
