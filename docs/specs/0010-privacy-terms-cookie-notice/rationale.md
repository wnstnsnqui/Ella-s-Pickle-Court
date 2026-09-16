# 0010 rationale: Privacy notice, terms of use, and the phone retention purge

## Context

Ella's Picklecourt holds two kinds of personal data. Staff type a customer's name, phone number, note and payment details into a booking (spec 0002), and staff themselves are known by name and email to Clerk and by Clerk id, name and role to PostHog (specs 0004 and 0009). The public board is open to anyone with the link, and spec 0009 made a point of keeping it cookieless: nothing is stored on a player's device, and visitor counts come from PostHog's daily hash. Two earlier specs handed this feature explicit debts: spec 0002 left `customer_phone` unpurged and asked this feature to state and enforce a retention period, and spec 0009 asked for a privacy line about anonymous counts on the board and named staff activity.

The venue and its customers are in the Philippines, so the Data Privacy Act of 2012 (Republic Act 10173) applies. In plain terms it asks a business that holds personal data to say who holds it and how to reach them, what is collected and why, where it is kept and for how long, and how a person can see, correct, or delete it. It has no cookie banner law; a notice is the obligation, consent is only needed where something is stored or read from the device that the visitor did not ask for. Nothing here reaches the thresholds that require registering a data protection officer with the National Privacy Commission.

Two things make this harder than writing two pages. First, the phone number lives in two places: the `reservation` row and, as JSON, in every `reservation_audit` row that ever recorded the booking, so a purge that only touches the row would make the privacy page untrue. Second, the app has no scheduled work of any kind yet; spec 0001 deliberately left background jobs empty and said `pg_cron` comes before any worker process. Whatever enforces retention is the first scheduled job in the system and sets the pattern.

The cost of not deciding: the public link goes out with customer phone numbers kept forever, no page a customer can read, and staff identified to a third party without being told. None of that breaks the app, which is exactly why it would stay that way.

## Options considered

### Option 1: Notice pages, a nightly `pg_cron` purge that redacts the audit trail, and a one time staff acknowledgement

Two static pages read from one constants file. Retention is a SQL function scheduled inside Postgres, running whether or not the app container is up. Staff acknowledge through a dialog backed by two columns on `staff` and a self only SQL function.

**Pros**:

- No new process, secret, or vendor. The first scheduled job in the system uses the mechanism spec 0001 already reserved for it.
- The purge is one transaction over both tables, so the page's promise is either fully kept or not made.
- The acknowledgement is a real record (who, when, which version), cheap to prove.

**Cons**:

- `pg_cron` must be enabled on the Supabase project and its schedule reads in UTC; the job is invisible from the app, so a silent failure shows up only in `cron.job_run_details`.
- Recreating `ensure_staff()` to return two more columns is a drop and create, a small chance to break sign in if the build gets the grant wrong.

### Option 2: Notice pages and a purge route in Next.js hit by an external scheduler

`GET /api/purge` guarded by a shared secret, called nightly by the host's cron. Same SQL, run through a server side client.

**Pros**:

- Everything in TypeScript, testable with Vitest like the rest of the app.
- Easy to run by hand from a browser or `curl`.

**Cons**:

- The hosting decision is still open, so the scheduler does not exist yet; the purge would stop whenever the container stops.
- Needs a new secret in the environment and a route that must never be exposed without it, plus the service role key or a new Postgres role, both things the rules keep out of application code.

### Option 3: Notice pages only, retention stated as a manual staff duty

The privacy page says the phone is removed "within 90 days" and an owner clears numbers by editing old bookings.

**Pros**:

- No migration, no job. Ships in an afternoon.

**Cons**:

- The scope row asks that something actually enforces it, and nothing would. The promise depends on a person remembering a chore with no reminder, which is the failure mode the whole app exists to remove from the notebook.
- Editing a booking never touches the audit JSON, so the number stays in the database anyway.

## Rationale

The forces are a small venue, one engineer, a database that already holds the safety, and two specs that have been waiting for a retention answer. Option 1 keeps enforcement where the data is: the same transaction clears the row and the history, and the job runs whether the app is up or not, which matters while hosting is undecided. Option 2 would move the promise into a process that does not exist yet and hand application code a key the rules forbid. Option 3 fails the scope row's own test.

The audit trail is the detail that decides it. Spec 0002 made the audit rows the booking's history on purpose, and they carry the whole row as JSON. A purge that forgets them leaves the privacy page false in a way nobody would notice until a customer asked. Doing it in SQL, in one function, is the only place both tables can be changed together.

The engineer chose an acknowledgement dialog for staff over a notice section alone. It costs a migration, a function, a dialog and an event, and it buys a record that each person saw each version, which is worth having when a handful of staff share a work tool that identifies them by name to a third party. The version column keeps that record honest when the notice changes.
