# Verify: Stack & architecture · spec 0001 · updated 2026-09-03

_Steps derived from spec 0001. `/check verify` runs these; `/test` locks the durable ones._
_Spec 0001 is a decision spec with no numbered acceptance criteria, so each step is tied to the architecture rule or stack row it proves._

## Credentials

All in place as of 2026-09-03: `.env.local` is filled in, the development project holds the migration, and Supabase now trusts Clerk as a third party auth provider. The steps still unticked below need a browser signed in to Clerk, which the verifying agent cannot do on its own.

## Commands

- [x] `npm run build` → succeeds, and the route list shows `/api/health` and `/smoke` as dynamic plus a Proxy entry → Hosting row, rule 13
- [x] `npx tsc --noEmit` → no output → Language row, TypeScript strict
- [x] `npm run lint` → no findings → Language row
- [x] `npm run dev`, then `curl -s localhost:3000/api/health` → JSON with a `status` field → Health and uptime row
- [x] `grep -rn "process.env.SUPABASE_SERVICE_ROLE_KEY" app lib proxy.ts` → no matches → rule 1
- [ ] `docker build -t picklecourt .` → image builds → Hosting row
- [x] `npx supabase db push` against the development project → migrations apply cleanly → rule 9 (applied by the engineer; confirmed live: the table reads, the trigger broadcasts, the policies refuse anon writes)

## Needs a live project

- [x] Open `/smoke` in two browsers, sign in on one, press "Bump the version" → the other browser's version and updated time change with no reload, within a second or two → Live updates row, rule 5
- [x] Change `label` on the `realtime_smoke` row directly in the Supabase SQL console → both browsers still move → Live updates row (the point of broadcasting from the database, not the Server Action)
- [x] Press "Bump the version" while signed out → a message saying to sign in, and the row does not change → rules 2 and 11
- [ ] With two tabs both showing version N, press the button in each → the second is told somebody changed it first and is shown the fresh version → rule 6
- [x] After a successful bump, read `changed_by` in the database → it holds the Clerk user id of whoever pressed the button → rule 7
- [x] Read `updated_at` in the database → stored as UTC; the page shows the Asia/Manila time for the same instant → rule 8, Time row
- [x] From a signed out browser session, attempt `update` on `public.realtime_smoke` with the anon key → refused by policy → rule 4
- [x] Stop the Supabase project, then `curl localhost:3000/api/health` → HTTP 503 with `"status":"degraded"` → Health and uptime row (checked by pointing the app at an unreachable Supabase URL rather than pausing the project)
- [ ] Sign in, leave the tab open past a Clerk token refresh, then bump again → still works, the channel does not have to be rebuilt → rule 12

## Value sourcing

Spec 0001 has no Value sourcing table; it decides the stack, not any court value. Feature 3 (data model) introduces the first values that need one.
