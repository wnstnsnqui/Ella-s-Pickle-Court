# Supabase clients

## Overview

Three ways to reach Supabase, deliberately kept apart. Which one you pick decides who
the database thinks is calling, and therefore which row level security policies apply.
Picking the wrong one is the easiest way to quietly break the read only guarantee on
the public board, so this is not a place to be clever.

## Key files

| File         | Owns                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `public.ts`  | Server side public reads. Anon key, no Clerk token, so the database sees an anonymous caller.                       |
| `staff.ts`   | Server side writes as the signed in staff member. Anon key plus that person's Clerk token, built fresh per request. |
| `browser.ts` | The browser's connection, used for listening to court broadcasts. Anon key, one instance per tab.                   |

## Conventions

- Server Actions use `staffSupabase()`, always through `requireStaff()` in `lib/actions.ts`, never directly.
- Server Components rendering public pages use `publicSupabase()`.
- Client Components use `browserSupabase()`, and only to listen. They never write.
- All three take their values from `publicEnv()` in `lib/env.ts`, which validates lazily so `next build` still works with no credentials.

## Gotchas

- **Never merge these into one shared client.** `staffSupabase()` carries one particular person's token, so caching it in a module level singleton would hand their identity to the next request.
- **The service role key is not available here on purpose.** If you find yourself wanting it, the real problem is usually a missing policy.
- `browser.ts` memoizes its client because a second one would open a second websocket for nothing.
- A private realtime channel needs `supabase.realtime.setAuth()` before `subscribe()`, even for anon, so the policy on `realtime.messages` can be evaluated at join time.

## Agent skills

- [supabase](../../.agents/skills/supabase/): `supabase/agent-skills`, client setup, realtime, and auth debugging

## Related specs

- [0001 Stack and architecture](../../docs/specs/0001-stack-architecture/index.md), rules 1, 4, 10, 11 and 12

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
