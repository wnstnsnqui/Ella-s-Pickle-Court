# Database schema and migrations

## Overview

The Postgres side of the app: forward only SQL migrations, the row level security
policies that are the real authorization layer, and the triggers that broadcast every
court change to open boards. Most of the safety in this project lives in this folder
rather than in the TypeScript.

## Key files

| File               | Owns                                                                |
| ------------------ | ------------------------------------------------------------------- |
| `config.toml`      | Local Supabase settings. Third party auth is off: the app mints its own token |
| `tests/*.test.ts`  | Database tests against the linked project, run with `npm run test:db`   |
| `migrations/*.sql` | Every schema change, in order, applied by the CLI                   |

## Commands

```bash
# Create a new migration (never invent the filename yourself). It reads the SQL
# from stdin, so pipe the file in; run bare it creates an empty migration.
npx supabase migration new <name> < path/to/change.sql

# Apply migrations to the linked project
npx supabase db push

# Check for security and performance problems after a schema change
npx supabase db advisors --linked

# Regenerate the TypeScript types after a schema change
npx supabase gen types typescript --linked --schema public > lib/supabase/database.types.ts
```

## Conventions

- Forward only. Never edit an applied migration, add a new one.
- Never change the schema by hand in the Supabase dashboard. The migration files are the record.
- Enable row level security on every table in `public`, and grant `anon` and `authenticated` explicitly. A grant is what makes a table reachable at all; policies then decide which rows.
- Policies key on the Better Auth user id (`staff.user_id`), as `(select auth.jwt() ->> 'sub')`; the token that carries it is minted by `lib/supabase/staff-token.ts`, not by Supabase Auth.
- Better Auth's own tables live in the `better_auth` schema, owned by the `better_auth_app` role, never exposed to PostgREST and with no grant to `anon`, `authenticated` or `public`. That role may execute exactly three `public` functions (`claim_staff_invite`, `claim_staff_reset`, `peek_staff_invite`). Identity lives there; the role and active flag stay on `public.staff`.
- Every change to `reservation`, `court`, `venue_settings` and `venue_hours` is broadcast by a trigger calling `realtime.send()` on the private `schedule` topic (events `reservation_changed`, `court_changed`, `settings_changed`), never from the application, so any write path reaches every open board. Never `realtime.broadcast_changes()`: it sends the whole row, customer phone included. Payloads carry identity and the four public columns at most; boards refetch on an event and never patch state from it.
- `venue_hours` holds exactly seven rows, one per `day_of_week` (`0` is Sunday, matching `extract(dow)` and `getUTCDay()`), and a day with both times null is closed. `insert` and `delete` are granted to nobody, so the cardinality is unwritable rather than policed. Write the week only through `save_venue_hours(days, settings_version, slot_minutes, booking_horizon_days)`, which guards on `venue_settings.version` and updates all seven rows in one transaction.

## Gotchas

- **`db advisors` and `db query` talk to the local Docker database unless you pass `--linked`.** Without it they fail with a connection refused on port 54322.
- **An UPDATE needs a SELECT policy too.** Without one it silently affects zero rows, with no error.
- **An UPDATE policy needs both `USING` and `WITH CHECK`**, or a caller can reassign a row to somebody else.
- **`SECURITY DEFINER` bypasses row level security.** The broadcast trigger uses it because it must, with `set search_path = ''`. Never reach for it to make a permission error go away.
- **A broadcast trigger that reads `subject.id` cannot be attached to a table without an `id` column.** `schedule_meta_broadcast()` does, so `venue_hours` (keyed by `day_of_week`) has its own near copy, `venue_hours_broadcast()`. Attaching the shared one raises "record has no field id" inside the writing transaction and aborts every save, and it fails at runtime rather than at build.
- A new table may not appear over the API until the roles are granted and the schema cache refreshes. `PGRST205` means the table is not there or not exposed.
- A policy keyed on `auth.jwt()` only works while the project's legacy HS256 JWT secret stays active: `staff-token.ts` signs with it. Rotating to asymmetric keys without keeping that key on breaks every staff write. Remove the old Clerk provider under Authentication, Third party in the dashboard; `config.toml` already has it off.
- Postgres will not rename a function parameter through `create or replace`: drop and recreate, or restate the function with the new name (see `20260919064809_staff_invites_better_auth.sql`). Function bodies are stored as text, so a column rename that policies follow on their own still needs every function naming the column restated.
- `migrations/20260903023010_realtime_smoke.sql` is a throwaway from the scaffold. Delete it and `app/smoke/` when the real court schema lands.
- `create or replace function` keeps the function's existing grants as long as its signature (name plus argument types) is unchanged, confirmed by querying `information_schema.routine_privileges` after widening a function's body in a later migration. No need to re-run `grant execute` just because the body changed.

## Agent skills

- [supabase-postgres-best-practices](../.agents/skills/supabase-postgres-best-practices/): `supabase/agent-skills`, read BEFORE writing any schema, migration, policy, index or trigger
- [supabase](../.agents/skills/supabase/): `supabase/agent-skills`, CLI usage and debugging

## Related specs

- [0001 Stack and architecture](../docs/specs/0001-stack-architecture/index.md), rules 2, 5, 6, 7, 8, 9 and 14
- [0004 Staff sign in with Better Auth](../docs/specs/0004-staff-sign-in/index.md), the `better_auth` schema, `staff_invite` and the link functions

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
