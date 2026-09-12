<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Ella's Picklecourt

A live court status board. Staff on shift keep each court current, players check it
from their phones, and Ella looks back at how the courts were used.

## Stack

- **Language / Runtime**: TypeScript 5 (strict), Node 22
- **Framework**: Next.js 16.3.3, App Router, React 19, Tailwind CSS 4
- **Key dependencies**: `@supabase/supabase-js` (database and realtime), `@clerk/nextjs` 7 (staff identity), `zod` (every Server Action boundary)
- **Package manager**: npm
- **Hosting**: self hosted Docker container, `output: "standalone"`

Mirrors [docs/specs/0001-stack-architecture/index.md](docs/specs/0001-stack-architecture/index.md), which is the source of truth.

## Build approach

**Tracer Bullet**: prove the whole path works end to end, narrow but real, before
thickening any part of it. From the scope header in [docs/scope/scope.md](docs/scope/scope.md).

## Commands

```bash
# Install
npm install

# Dev server
npm run dev

# Build
npm run build

# Lint
npm run lint

# Format (Prettier owns layout; ESLint owns real problems)
npm run format
npm run format:check

# Typecheck
npx tsc --noEmit

# Test (Vitest)
npm test

# Everything a slice has to pass, in one go
npm run check

# Apply migrations to the linked Supabase project
npx supabase db push
```

## Git

- integration: off

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title/index.md`.

## Rules

- **Two Supabase clients, never merged.** `publicSupabase()` is anon and read only; `staffSupabase()` carries the signed in staff member's Clerk token and is built fresh per request. Merging them into a shared singleton breaks the read only guarantee on the public board.
- **The service role key never reaches application code.** It is for migrations and admin tooling only. Nothing under `app/` or `lib/` may read it.
- **Authorization is a row level security policy, never an `if` in a Server Action.** An app level check is fine for a friendlier error, but Postgres is the enforcement point.
- **Every Server Action calls `requireStaff()` first, then validates with Zod, then writes.** Server Actions accept whatever the network sends.
- **Every write that changes state is conditional on the row's `version` and records `changed_by`.** A zero row result means somebody else got there first; refetch and show the fresh state rather than swallowing it.
- **All timestamps are `timestamptz` in UTC.** Local time exists only when showing something to a person, and it is always `Asia/Manila`, never the reader's device.
- **Migrations are forward only SQL files in `supabase/migrations/`, applied by the CLI.** No schema changes by hand in the dashboard.
- **This is Next.js 16 and Clerk 7.** Request interception is `proxy.ts`, not `middleware.ts`. Clerk 7 is Core 3, so `<SignedIn>` and `<SignedOut>` do not exist; use `<Show when="signed-in">`. Read `node_modules/next/dist/docs/` before writing framework code.
- **A page whose value is being current renders per request.** No static or cached rendering on the boards.
- **Prettier owns layout, ESLint owns real problems.** `eslint-config-prettier` stands down every formatting rule, so never add one back. Run `npm run check` before calling a slice finished: it is lint, format check, typecheck, and tests in that order.

## Agent skills

- [supabase](.agents/skills/supabase/): `supabase/agent-skills`, anything touching Supabase: clients, realtime, auth, CLI, debugging
- [supabase-postgres-best-practices](.agents/skills/supabase-postgres-best-practices/): `supabase/agent-skills`, read BEFORE writing any schema, migration, RLS policy, index or trigger
- [clerk-setup](.agents/skills/clerk-setup/): `clerk/skills`, adding and configuring Clerk
- [clerk-nextjs-patterns](.agents/skills/clerk-nextjs-patterns/): `clerk/skills`, Clerk in proxy, Server Actions and caching
- [tailwind-4-docs](.agents/skills/tailwind-4-docs/): `lombiq/tailwind-agent-skills`, Tailwind 4 utilities and config (v3 patterns are wrong here)
- [zod](.agents/skills/zod/): `pproenca/dot-skills`, schema validation and inferred types
- [vitest](.agents/skills/vitest/): `antfu/skills`, writing tests, mocking with `vi.*`, coverage and test filtering

MCP servers: supabase (recommended, not connected), clerk (recommended, not connected)
Declined: prettier (the setup is done and the available skills are all scaffolders)

## Context files

- [lib/supabase/AGENTS.md](lib/supabase/AGENTS.md): the three Supabase clients and which one to reach for
- [supabase/AGENTS.md](supabase/AGENTS.md): migrations, row level security policies, and the broadcast trigger

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
