# Database schema and migrations

## Overview

The Postgres side of the app: forward only SQL migrations, the row level security
policies that are the real authorization layer, and the triggers that broadcast every
court change to open boards. Most of the safety in this project lives in this folder
rather than in the TypeScript.

## Key files

| File               | Owns                                                                |
| ------------------ | ------------------------------------------------------------------- |
| `config.toml`      | Local Supabase settings, including the Clerk third party auth block |
| `migrations/*.sql` | Every schema change, in order, applied by the CLI                   |

## Commands

```bash
# Create a new migration (never invent the filename yourself)
npx supabase migration new <name>

# Apply migrations to the linked project
npx supabase db push

# Check for security and performance problems after a schema change
npx supabase db advisors
```

## Conventions

- Forward only. Never edit an applied migration, add a new one.
- Never change the schema by hand in the Supabase dashboard. The migration files are the record.
- Enable row level security on every table in `public`, and grant `anon` and `authenticated` explicitly. A grant is what makes a table reachable at all; policies then decide which rows.
- Policies key on the Clerk user id, as `(select auth.jwt() ->> 'sub')`.
- Court changes broadcast from a trigger calling `realtime.broadcast_changes()`, not from the application, so any write path reaches every open board.

## Gotchas

- **An UPDATE needs a SELECT policy too.** Without one it silently affects zero rows, with no error.
- **An UPDATE policy needs both `USING` and `WITH CHECK`**, or a caller can reassign a row to somebody else.
- **`SECURITY DEFINER` bypasses row level security.** The broadcast trigger uses it because it must, with `set search_path = ''`. Never reach for it to make a permission error go away.
- A new table may not appear over the API until the roles are granted and the schema cache refreshes. `PGRST205` means the table is not there or not exposed.
- Clerk third party auth must be enabled on both sides, in `config.toml` here and in the Supabase dashboard, before any policy keyed on `auth.jwt()` can work.
- `migrations/20260903023010_realtime_smoke.sql` is a throwaway from the scaffold. Delete it and `app/smoke/` when the real court schema lands.

## Agent skills

- [supabase-postgres-best-practices](../.agents/skills/supabase-postgres-best-practices/): `supabase/agent-skills`, read BEFORE writing any schema, migration, policy, index or trigger
- [supabase](../.agents/skills/supabase/): `supabase/agent-skills`, CLI usage and debugging

## Related specs

- [0001 Stack and architecture](../docs/specs/0001-stack-architecture/index.md), rules 2, 5, 6, 7, 8, 9 and 14

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
