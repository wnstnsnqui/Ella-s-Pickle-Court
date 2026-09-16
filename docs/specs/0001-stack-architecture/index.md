# 0001. Stack and architecture for the court monitor

**Date**: 2026-09-03
**Status**: Accepted

## Summary

Ella's Picklecourt runs as a single Next.js 16 application, deployed on Vercel for now with a move to a self hosted container planned, with Supabase Cloud as the database and live update channel, and Clerk for staff sign in. Staff changes are written by Server Actions that carry the signed in staff member's Clerk token, so the database itself, through row level security (rules stored in Postgres that decide who may read or write each row), refuses any write from someone not signed in. A database trigger broadcasts every court change, so open public boards update themselves within a second or two with no page reload. It is one deployable app, one database, two vendors, and everything is on a free tier except the small server.

## Decision

**Chosen option**: Option 1: Next.js monolith on Supabase Cloud, with Clerk auth, self hosted in a container. Deployed on Vercel as an interim step (2026-09-17) since it deploys fastest; `next.config.ts` keeps `output: "standalone"` behind a `process.env.VERCEL` check so the move to a Docker host stays a hosting change, not a code change.

One Next.js 16 application (no separate backend service) reads and writes a Supabase Postgres database directly. Clerk owns staff identity and Supabase is configured to trust Clerk as a third party auth provider, so row level security is the single place authorization is enforced.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.claude/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.claude/skills/supabase-postgres-best-practices/`) · `clerk-setup` (`clerk/skills`, `.claude/skills/clerk-setup/`) · `clerk-nextjs-patterns` (`clerk/skills`, `.claude/skills/clerk-nextjs-patterns/`) · `tailwind-4-docs` (`lombiq/tailwind-agent-skills`, `.claude/skills/tailwind-4-docs/`) · `zod` (`pproenca/dot-skills`, `.claude/skills/zod/`)

## Rationale

Reasoning, the options weighed, and the landscape check behind these picks: see [rationale.md](rationale.md).

## Proposed stack

| Layer                   | Choice                                                                                            | Reason                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture pattern    | Single Next.js app, no separate backend                                                           | One venue, one developer. A monolith is the fastest thing to build, debug and operate, and nothing here needs a service boundary.                                                                     |
| Language                | TypeScript 5 (strict)                                                                             | Already in the scaffold, and strong types are what let an AI agent change this code later without breaking it.                                                                                        |
| Framework               | Next.js 16.3.3, App Router, React 19                                                              | Already scaffolded. Server Actions and server rendering give the whole read and write path without a separate API service.                                                                            |
| Styling                 | Tailwind CSS 4                                                                                    | Already scaffolded. Version 4 has no JavaScript config file, so v3 patterns are wrong here.                                                                                                           |
| Primary database        | Supabase Cloud Postgres, free tier                                                                | Relational data with clear relationships (courts, states, sessions, staff), and Slice 4 reporting is a SQL job. Free tier covers one venue comfortably.                                               |
| Live updates            | Supabase Realtime broadcast, fired from a Postgres trigger calling `realtime.broadcast_changes()` | The path Supabase itself now recommends over subscribing to table changes. The database is the single source of the event, so any write path (app, SQL console, future job) reaches every open board. |
| Auth                    | Clerk, wired to Supabase as a native third party auth provider                                    | Clerk owns sign in, sessions and the account screens. Supabase verifies Clerk tokens from Clerk's public key endpoint, so row level security still knows who the user is via `auth.jwt()->>'sub'`.    |
| Staff accounts          | Invite only in Clerk, mirrored into a `staff` table keyed `clerk_user_id text primary key`        | Policies need a row in the database to join on, and a court board has no reason to let strangers sign up.                                                                                             |
| Authorization           | Postgres row level security, keyed on the Clerk user id                                           | Security lives in one place the app cannot forget to check, rather than in every write path.                                                                                                          |
| Health and uptime       | A health endpoint, a container restart policy, and an external uptime ping, from day one          | Full observability waits for feature 11, but a freshness product that dies quietly is worthless. This is the minimum that tells you the board is up.                                                  |
| Data access             | `supabase-js` only, plus plain SQL migration files in `supabase/migrations/`                      | One client for queries and realtime. Triggers, policies and unique indexes are written as SQL, which is where the race safety actually lives. No ORM.                                                 |
| Writes                  | Next.js Server Actions, calling Supabase as the signed in staff member                            | The action attaches the Clerk token, so the database enforces the rule. Server Actions accept whatever the network sends, so every one validates its input with Zod first.                            |
| Concurrency control     | Optimistic locking on a `version` integer column per court                                        | Two staff on stale tablets cannot silently overwrite each other. The losing write is rejected and that staff member is shown the fresh state.                                                         |
| Validation              | Zod at every Server Action boundary                                                               | TypeScript disappears at runtime. Zod is the layer that stops malformed input reaching a court row, and the types are inferred from the same schema.                                                  |
| Rendering, public board | Server rendered per request, then live via the realtime channel                                   | The first paint already shows real court states, so the page is correct before the websocket connects and it is properly indexable for link sharing.                                                  |
| Hosting                 | Vercel for now, moving to a self hosted Docker container later                                    | Vercel is the fastest way to get a working deploy today. `next.config.ts` turns `output: "standalone"` off only when `VERCEL` is set, so the same repo and `Dockerfile` still produce a self hosted container build once a Docker host is picked. |
| Deploys                 | Push to `main`, the host builds and redeploys automatically                                       | A panel such as Coolify or Dokploy, or a managed container host, gives git push deploys, automatic TLS and one click rollback without you writing scripts.                                            |
| Environments            | Two Supabase Cloud projects, development and production                                           | A bad migration in development cannot take down the live board.                                                                                                                                       |
| Time                    | Store `timestamptz` in UTC, display everything in `Asia/Manila`                                   | Correct across daylight saving anywhere, and reporting by hour stays honest. One venue, one display timezone.                                                                                         |
| Observability           | Deferred to feature 11                                                                            | Not needed to prove the tracer bullet thread. Do not invent a logging stack before then.                                                                                                              |
| Background jobs         | None yet                                                                                          | Nothing in the current scope needs scheduled work. If session closing needs it later, use `pg_cron` in Postgres before adding any worker.                                                             |
| File storage            | None yet                                                                                          | No uploads in scope. Supabase Storage is already available if that changes.                                                                                                                           |

### Architecture rules the build must honor

These are the decisions the build cannot quietly reverse. They are not build steps; the scaffold sub task derives those.

1. **The service role key never reaches application code.** It exists for migrations and admin tooling only. Every request path uses the anon or publishable key plus the caller's Clerk token.
2. **Authorization is expressed as row level security policies, never as an `if` statement in a Server Action.** An app level check may be added for a nicer error message, but the database is the enforcement point.
3. **Anything that changes a court row goes through a Server Action that validates with Zod first.** No direct writes from client components.
4. **The public board reads with the anon key and no Clerk token.** Its access is granted by an explicit read only policy. It must never be able to write.
5. **Realtime authorization**: court broadcasts go out on a private channel, and a policy on `realtime.messages` scoped with the `realtime.topic()` helper grants the `anon` role read access to that one topic. This was verified as expressible: the anon key creates a session with the `anon` role, and the policy is evaluated when the websocket joins the channel. Court rows carry no personal data, so this is safe today. The runner up, a plain public channel broadcast manually from the Server Action, was rejected because it misses any write that does not come from the app, and it stays the fallback if the scoped policy ever proves too permissive.
6. **Every court write is a conditional update** matching the `version` the client last saw, and increments it. A zero row result means someone else changed it first. The action then refetches the row and returns the fresh state, so the staff member's screen corrects itself before they retry. The rejection is never swallowed and never surfaced as a bare error.
7. **Every state changing write records who made it**, in a `changed_by` column sourced from the same token claim the policies use. Features 9 and 10 depend on this, and adding it later would mean backfilling history that was never captured.
8. **All timestamps are `timestamptz`.** No naive local times anywhere, in the database or in code.
9. **Migrations are forward only SQL files** in `supabase/migrations/`, applied by the Supabase CLI. No schema changes made by hand in the dashboard.
10. **Two Supabase clients, never one.** A plain anon client for public reads, and a per request client created inside the Server Action carrying the signed in staff member's Clerk token. They are not interchangeable and must not be merged into a shared singleton.
11. **Every Server Action checks Clerk first.** Call Clerk's `auth()` and return a typed error when there is no session, before touching Supabase. Otherwise an expired session arrives as an opaque policy denial that is painful to debug.
12. **The staff realtime connection refreshes its own token.** On Clerk's token refresh, call `realtime.setAuth()` with the new token rather than tearing down and rebuilding the connection.
13. **The public board route renders dynamically per request.** No static or cached rendering on the page whose entire value is being current.
14. **One open session per court is enforced by a partial unique index**, on the court, where the session has no end time. Optimistic locking stops two people overwriting a row; it does not stop two open sessions existing.

### Configuration required

- `NEXT_PUBLIC_SUPABASE_URL`: the Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the public key used by the browser and by server reads
- `SUPABASE_SERVICE_ROLE_KEY`: migrations and admin tooling only, never imported by app code
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk client key
- `CLERK_SECRET_KEY`: Clerk server key
- `NEXT_PUBLIC_VENUE_TIMEZONE`: `Asia/Manila`, the single display timezone

Each value differs per environment. Development points at the development Supabase project and a Clerk development instance. A Clerk webhook signing secret is also needed once staff provisioning is wired, and feature 5 owns that.

### Explicit deferrals

Named here so they are known gaps rather than silent ones.

- **Court state values, and keeping the database constraint and the Zod schema identical.** Feature 3, the data model, owns this. They must be defined once and derived, not typed out twice.
- **What closes a session a staff member forgot to close.** Feature 9 owns this. If it needs scheduled work, use `pg_cron` inside Postgres before adding any worker process.
- **Revisit the anonymous realtime channel when feature 9 lands.** The "no personal data" argument holds for court state. Once the broadcast payload or session records carry staff identifiers, that argument stops holding and the public payload must be narrowed.

## Consequences

**Positive**

- One deployable app and one database. There is no service boundary to debug at 2am.
- Authorization cannot be forgotten, because it lives in the database rather than in each write path.
- The live update path is driven by the database, so any future write route reaches every open board for free.
- Postgres keeps Slice 4 usage reporting a plain SQL job rather than an export and crunch exercise.
- Everything except the VPS sits on a free tier at this size.

**Negative and tradeoffs**

- **Two auth systems to reason about.** Clerk owns the user, Supabase owns the data, and they are joined by a token. That join is one more thing that can be misconfigured, and it must be set up correctly before any policy can be tested. Supabase Auth would have removed this seam entirely.
- **You own uptime.** Self hosting means TLS renewal, server patching, and being the one who notices when the box is down. Free managed hosting would have removed that.
- **Two vendor bills eventually.** Clerk is free to ten thousand monthly active users and Supabase free tier is generous, but growth or a paid Supabase plan changes that, and Supabase bills third party auth users on paid plans.
- **The Supabase free tier pauses a project after about a week of no activity.** A live public board will keep it awake, but the development project will pause and need waking.
- **No ORM means writing SQL.** That is the right trade for triggers and policies, but there is no generated type safety unless the build also generates types from the schema.
- **Optimistic locking is visible to staff.** Occasionally someone will be told their change did not land and asked to look again. That is the honest behaviour, and it is still a small extra step at the desk.

**Neutral**

- Row level security, Postgres triggers and Server Actions are each a pattern to learn once, and they then repeat across every later slice.
- No caching, queue or observability layer exists yet, on purpose. Add each only when something measurable calls for it.
- The data model is not decided here. Feature 3 owns it, and it inherits the `version` column, `timestamptz` and row level security rules above as constraints.

## Follow-up

- [ ] Root `AGENTS.md` still only carries the Next.js block. It needs the real stack, the eight architecture rules above, and an `## Agent skills` section covering the six skills just installed. `/audit` owns that, and it is feature 2 in the scope.
- [ ] Connect the Supabase and Clerk MCP servers in your own client settings. You chose both, and connecting them is a step only you can do. Once connected, an agent can read the real schema and real policies instead of assuming them.
- [x] Pick the hosting provider and deploy panel before the scaffold ships. Deployed on Vercel (2026-09-17) as an interim step. Still open: pick the Docker host (Railway, Fly.io, or a VPS with a panel like Coolify/Dokploy) for the planned move off Vercel, and its TLS, domain and deploy trigger.
- [ ] Decide whether to generate TypeScript types from the Supabase schema. Recommended, since there is no ORM to provide them.
- [ ] Feature 5, staff sign in, owns the Clerk webhook that creates the `staff` row, and the invite only configuration. The `staff` table shape is a constraint from here, the provisioning flow is its own decision.
- [ ] Pick the uptime ping service. Any free one is fine, and having none is not.
