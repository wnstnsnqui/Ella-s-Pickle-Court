# Ella's Picklecourt

A live court status board. Staff on shift keep each court current, players check it from their phones, and Ella looks back at how the courts were used.

Pick a day and see time down the side and a column per court, with every cell reading Booked, Available or Unavailable. A change made by staff reaches every open screen without a reload.

## Stack

- **Next.js 16** (App Router), **React 19**, **TypeScript 5** (strict), **Tailwind CSS 4**
- **Supabase** for Postgres, row level security and realtime broadcast
- **Better Auth** for staff identity, in the project's own Postgres
- **Zod** at every Server Action boundary
- **Vitest** for tests, **ESLint** + **Prettier** for lint and layout
- Self hosted as a **Docker** container (`output: "standalone"`)

The full decision record lives in [docs/specs/0001-stack-architecture](docs/specs/0001-stack-architecture/index.md).

## Getting started

Requires Node 22 and npm.

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

Copy [.env.example](.env.example) to `.env.local` and fill it in:

| Variable                        | Purpose                                                               |
| ------------------------------- | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL                                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public key for the browser and server side public reads               |
| `SUPABASE_SERVICE_ROLE_KEY`     | Migrations and admin tooling only. Never imported by application code |
| `BETTER_AUTH_SECRET`            | Signs sessions and invite cookies. `openssl rand -base64 32`          |
| `BETTER_AUTH_URL`               | The site origin, the base of every invite and reset link              |
| `BETTER_AUTH_DATABASE_URL`      | The `better_auth_app` role's pooler URL, runtime only                 |
| `SUPABASE_JWT_SECRET`           | The project's legacy JWT secret, read by one module, runtime only     |
| `BOOTSTRAP_OWNER_USERNAME`      | The one username that may create the first account                    |
| `NEXT_PUBLIC_VENUE_TIMEZONE`    | The single display timezone for the venue (`Asia/Manila`)             |

### Database

Migrations are forward only SQL files in [supabase/migrations/](supabase/migrations/), applied with the Supabase CLI:

```bash
npx supabase db push
```

Two one time steps after the first push of the Better Auth migrations (spec 0004): set the
`better_auth_app` role's password in the SQL editor (`alter role better_auth_app password '...'`)
and put it in `BETTER_AUTH_DATABASE_URL`; and copy the legacy JWT secret from the dashboard's JWT
settings into `SUPABASE_JWT_SECRET`. Leave that legacy HS256 key active when rotating to
asymmetric keys, or every staff write fails.

### The first account

While no account exists, `/sign-up` shows a form that only `BOOTSTRAP_OWNER_USERNAME` can complete.
That account is the owner. Every later account comes from a link an owner or superadmin makes on
`/staff/admin/users`; the same screen makes password reset links.

No schema changes are made by hand in the dashboard.

## Commands

```bash
npm run dev            # dev server
npm run build          # production build
npm run lint           # ESLint, zero warnings allowed
npm run format         # Prettier, write
npm run format:check   # Prettier, check only
npx tsc --noEmit       # typecheck
npm test               # Vitest, single run
npm run test:watch     # Vitest, watch mode
npm run check          # lint, format check, typecheck, tests, in that order
```

Run `npm run check` before calling any slice finished.

## Project layout

```
app/                  Next.js App Router pages, layouts and route handlers
  api/health/         Uptime endpoint, reports degraded when the database is unreachable
  design/             Design system gallery: tokens, components, contrast audit
components/           UI: app shell, schedule grid, shadcn/ui primitives
lib/
  supabase/           The Supabase clients (public, staff, browser) and generated types
  schedule/           Grid derivation, queries, actions and Zod schemas
  actions.ts          requireStaff() guard for Server Actions
  env.ts              Validated environment
  time.ts             Asia/Manila helpers over UTC timestamps
supabase/migrations/  Forward only SQL migrations
proxy.ts              Request interception (the staff door), Next.js 16's replacement for middleware.ts
docs/
  scope/              Living scope, what is built and what is next
  specs/              Numbered build specs, the source of truth for each decision
  design.md           Design notes
Dockerfile            Multi stage standalone build
```

## Architecture rules

- **Two Supabase clients, never merged.** `publicSupabase()` is anon and read only; `staffSupabase()` carries a token minted for the signed in staff member and is built fresh per request.
- **The service role key never reaches application code.** Migrations and admin tooling only.
- **Authorization is a row level security policy**, never an `if` in a Server Action. Postgres is the enforcement point.
- **Every Server Action calls `requireStaff()` first, then validates with Zod, then writes.**
- **Every state changing write is conditional on the row's `version` and records `changed_by`.** A zero row result means somebody else got there first; refetch and show the fresh state.
- **All timestamps are `timestamptz` in UTC.** Local time exists only when showing something to a person, and it is always `Asia/Manila`.
- **A page whose value is being current renders per request.** No static or cached rendering on the boards.

See [AGENTS.md](AGENTS.md) for the full set, and the nested context files in [lib/supabase/](lib/supabase/AGENTS.md) and [supabase/](supabase/AGENTS.md).

## Deployment

The app ships as a Docker image built from the [Dockerfile](Dockerfile). `NEXT_PUBLIC_*` values are inlined at build time, so pass them as build arguments; the secrets (`BETTER_AUTH_SECRET`, `BETTER_AUTH_DATABASE_URL`, `SUPABASE_JWT_SECRET`, `BOOTSTRAP_OWNER_USERNAME`) are passed at runtime and never baked into the image.

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  -t ellas-picklecourt .

docker run -p 3000:3000 \
  -e BETTER_AUTH_SECRET=... -e BETTER_AUTH_URL=... -e BETTER_AUTH_DATABASE_URL=... \
  -e SUPABASE_JWT_SECRET=... -e BOOTSTRAP_OWNER_USERNAME=... \
  ellas-picklecourt
```

The container exposes port 3000 and health checks `GET /api/health`.

## Progress

Built as a tracer bullet: prove the whole path end to end, narrow but real, then thicken. Current status per feature is tracked in [docs/scope/scope.md](docs/scope/scope.md).
