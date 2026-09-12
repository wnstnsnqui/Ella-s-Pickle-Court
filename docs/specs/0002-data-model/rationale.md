# 0002. Data model, the reasoning

The build spec is [index.md](index.md). This file is the decision record. `/develop` skips it.

## Context

> ⚠️ Premise note: this spec was opened as "the data model" for the live court status board the scope describes, where staff tap a court and players see a current state. Partway through the design conversation the real goal turned out to be different: to see whether a court is already booked at a given time, and when it is next free. Those are not the same product. A status board stores one current state per court; a booking system stores many rows per court, each with a time range, and its central problem is refusing overlaps. Building the status board and then discovering this would have meant discarding the schema, the boards, and the session history design, which is exactly the expensive redo scope feature 3 exists to prevent. This spec records the booking schedule. The scope now describes a product that is not being built, and reworking it is the first follow up.

Ella's Picklecourt has two courts and runs on staff answering the phone. Somebody asks whether court 1 is free at 5pm on Saturday, and today the answer lives in a notebook or somebody's head. What is needed is a shared grid: pick a day, see time down the side and a column per court, and read each cell as Booked, Available or Unavailable. Players read it before they drive over. Staff keep it, and enter every booking themselves, whether it came by phone, message or walk in. Players do not book themselves yet, which keeps player accounts, cancellations by customers, no shows and payments out of scope for now.

The forces that actually shaped the choice:

**Two staff can act at the same instant.** Two people at the desk, or one at the desk and one on a phone, can both take a booking for court 2 at 5pm. If the schedule allows that, the product has failed at the one job it exists to do, and the failure is invisible until two groups turn up. Spec 0001 already established optimistic locking on a `version` column, but that protects one row from being overwritten. It does nothing about two different rows that happen to describe the same hour, which is a different problem needing a different mechanism.

**The data is the reporting.** Ella wants to look back at how the courts were used, and now also at what was paid. Whatever stores today's schedule is also the raw material for that, so it has to keep cancellations and closures rather than deleting them, and it has to record money accurately enough to sum.

**Some of it is personal, and one board is public.** A booking carries a customer's name and phone number, and now an amount. The public grid is open to anyone with the link. Postgres row level security decides which rows a caller sees, not which columns, so keeping the phone number off the public page needs a deliberate design rather than a policy.

**The constraints from spec 0001 are fixed.** UTC `timestamptz` throughout with `Asia/Manila` as the only display timezone, a `version` column and `changed_by` on every state changing write, authorization expressed only as row level security policies, forward only SQL migrations, no ORM, two Supabase clients that are never merged, and live updates broadcast from a database trigger. This spec inherits every one of them.

**The scale is small and will stay small.** Two courts, one venue, a handful of staff, and at most a few dozen bookings a day. Nothing here justifies a design that trades clarity for throughput. What it does justify is refusing to add moving parts, because there is nobody to operate them.

The consequence of not deciding is that every screen in slices 1 through 4 gets built against a guess, and the guess most likely to be made is the one that stores a status per cell, which is the shape hardest to change afterwards.

## Options considered

### Option 1: One table of time ranges, with a Postgres exclusion constraint

A `reservation` row is a court, a start, an end, and a `kind` of `booking` or `closed`. An exclusion constraint on `(court_id, during)` filtered to active rows makes an overlapping row impossible. Available is the absence of a row inside opening hours. The grid is computed at read time from the opening hours and the rows that exist.

**Pros**

- Double booking is prevented by the database, so it holds under simultaneous writes and under any future write path, not just the Server Actions written today.
- Nothing is generated in advance. There is no job creating rows for future days and nothing to backfill when the venue books further ahead.
- Changing slot length or opening hours is a settings change, because slots are a display concept rather than a stored one.
- Closures and bookings sharing one table means one constraint stops a booking landing inside a closure, for free.
- The table is already the history that features 9 and 10 need.

**Cons**

- Reading the grid is not a plain select. Slot rows have to be generated and matched against ranges in code, and that code has to handle `Asia/Manila` correctly.
- `tstzrange`, `btree_gist` and exclusion constraints are Postgres features the team has not used yet, and the conflict arrives as a constraint violation the Server Action must recognise by name.

### Option 2: One row per cell of the grid

A row for every court, every day, every slot, each holding a status. The grid is one select with no computation.

**Pros**

- The simplest possible read, and the easiest thing to reason about when looking at the table directly.
- The status per cell is explicit, so there is no derivation code to get wrong.

**Cons**

- Rows must be created ahead for every future day, by a scheduled job the project does not have and spec 0001 deliberately avoided. When the job fails, the grid silently shows nothing.
- Changing slot length or opening hours means regenerating every future row, which is a migration and a data rewrite rather than a settings edit.
- Preventing a double booking becomes an application problem again. Two writes to the same cell row would be caught by the `version` column, but a two hour booking spans two rows and there is no way to make those two writes atomic without a transaction the Supabase client does not naturally express.
- A booking that does not align to the slot grid cannot be represented at all.

### Option 3: Ranges as the truth, plus a per cell cache

Option 1's table, plus a generated table of cell statuses kept in step by triggers, so reads stay trivial.

**Pros**

- Both the safety of the constraint and the simplicity of the read.
- Would matter at a scale where computing the grid per request became measurable.

**Cons**

- Two copies of the truth, which is the failure mode this whole design is trying to avoid. When they disagree, and eventually they do, the public page is wrong and nothing says so.
- Trigger maintained caches are the hardest thing in this list to debug, and there is nobody to debug them.
- Solves a performance problem that does not exist at two courts.

## Rationale

Option 1 is chosen because the one thing this product cannot get wrong is exactly the thing a Postgres exclusion constraint makes impossible. Two staff acting at the same instant is not a hypothetical here; it is the normal way a small venue with a phone and a desk operates. Every other option leaves that guarantee to application code, and application code that runs on two servers, or in two Server Action invocations, cannot provide it.

The second force, that the data is also the reporting, points the same way. Storing time ranges means a cancelled booking, a closure and a completed session are all the same shape, so feature 10 reads one table. The per cell design would have forced a separate history table and a job to fill it, which is a second copy of the truth by another name.

Against Option 2's real advantage, that reading is trivial, the deciding consideration is that its cost is paid in operations rather than in code. Generating rows for future days needs a scheduled job, and spec 0001 explicitly avoided adding one. A grid derivation module in TypeScript is about a hundred lines that Vitest can test with no database, which is a much better place for this project to spend its difficulty than on a `pg_cron` job whose failure is silent.

Two calls made here with full design context, neither of which was put to the engineer as a question:

**Primary keys are `bigint generated always as identity`, not `uuid`.** The installed `supabase-postgres-best-practices` skill is explicit that random UUIDv4 keys fragment indexes and that identity columns are the default for a single database. The scaffold's throwaway smoke table used a uuid, so the pattern was there to copy, and copying it would have been the wrong default. The runner up is UUIDv7, which is worth revisiting only if ids ever need to be generated outside the database.

**The public narrowing is a column level grant, not a view and not an RPC function.** Row level security filters rows, not columns, so a policy alone cannot keep `customer_phone` off a public read. The first draft of this spec reached for a `security definer` view, which works but runs as its owner and therefore bypasses row level security entirely, leaving the view definition as the only thing between a careless edit and a leak. A cross check pass caught it. Postgres column grants do the same job with row level security left switched on end to end, and they raise no advisor warning to get used to dismissing. An RPC function was the other candidate and was rejected because the grid derivation belongs in TypeScript, where both the public page and the staff page share it and where Vitest can test it with no database, rather than in PL/pgSQL.

A third point is worth recording because it is the most likely build mistake in this spec. The scaffold's smoke migration broadcasts with `realtime.broadcast_changes()`, which sends the whole row. Copying that pattern onto `reservation` would publish customer names, phone numbers and amounts on a channel anonymous visitors can read. The trigger has to build a narrowed payload and send it with `realtime.send()` instead, and that is stated as a rule in the Security model rather than left as a detail.

Finally, on the engineer's choice that only an owner may edit a past booking: this was chosen deliberately over the recommended option, which would have kept the payment fields editable. It is the safer rule for history and the more awkward one at the desk, since payments are often settled after the fact. It stands as chosen, and the consequence and the narrow fix are both written down so that when it does bite, the answer is already on the page.
