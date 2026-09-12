# 0001. Stack and architecture, decision record

Reasoning behind [index.md](index.md). Read this when revisiting the decision, not when building.

## Context

> ⚠️ Premise note: two of the choices here pull against the shape of the rest. Clerk on top of Supabase adds a second identity vendor and a token join that Supabase Auth would not need, and self hosting adds TLS, patching and uptime that free managed hosting would not. Neither is wrong, and both are supported paths, but the combination means a board for a handful of staff accounts at one venue now carries two vendors and an operations burden. The failure mode to watch is a misconfigured Clerk to Supabase token join, which does not fail loudly, it fails as row level security policies that silently match nobody. The engineer was told this and confirmed both choices, so the design commits to them properly rather than half way: the third party auth integration is native, not the deprecated shared secret template, and hosting is specified as any Docker capable host so the provider stays a late decision.

The repository is an untouched Next.js 16.3.3 starter with four source files. Every load bearing choice is open: where data lives, how staff sign in, how a change reaches every open screen by itself, and where it runs.

The forces that actually shaped the choice:

- **Live update is the product.** A court board that shows a stale court is worse than no board. The whole of Slice 1 exists to prove one thread: a staff member taps a court and a player watching the public page sees it change. Whatever the stack is, it has to push, not poll.
- **One venue, tiny.** Roughly four to twenty courts, a handful of staff, a few hundred public views a day, with a spike when everyone checks at once in the evening. Nothing here strains any modern stack, so the tie breaker is fewest moving parts, not throughput.
- **Free or near free, fully managed where possible.** No budget for infrastructure beyond a small server.
- **One person plus AI agents maintains it.** That argues for strong types, few components, and conventions an agent can follow from installed skills rather than infer.
- **The data is relational and reporting comes later.** Courts, their state over time, sessions, and staff accounts have obvious relationships, and Slice 4 asks for usage by hour and by day across a date range. That is a SQL question.
- **Two staff can touch the same court at the same moment.** A desk tablet and a phone can both be showing a court that changed ten seconds ago.
- **Nothing here is regulated data.** No payments, no health data, and no player personal data in the current scope. Staff accounts are the only personal data, and Clerk holds those.

The cost of not deciding is that every later feature guesses, and the two most expensive things to redo, the data model and the authorization model, both hang off this choice.

## Options considered

### Option 1: Next.js monolith on Supabase Cloud, Clerk auth, self hosted container

One Next.js app talking to Supabase Postgres. Supabase supplies the database, row level security and the realtime broadcast channel. Clerk supplies identity, and Supabase is configured to trust Clerk's tokens natively so policies can read the Clerk user id.

**Pros**

- Database, live updates and authorization come from one service, already integrated, on a free tier.
- Authorization is enforced in the database, so no write path can forget it.
- Postgres keeps later reporting simple, and gives triggers, unique indexes and conditional updates for race safety.
- Both Clerk and Supabase publish official agent skills, which materially improves what an AI agent builds here.

**Cons**

- Two identity systems joined by a token, which is a real seam and a quiet failure mode when misconfigured.
- Self hosting means you own TLS, patching and uptime.
- Two vendor relationships, and Supabase bills third party auth users on paid plans.

### Option 2: Next.js monolith on Supabase Cloud, Supabase Auth, hosted on Vercel

The same shape with the seam removed. Supabase Auth issues the tokens its own row level security reads, and Vercel runs the app on its free tier.

**Pros**

- Fewest possible moving parts, and the shortest path from zero to a working live board.
- Auth and row level security are one system, so there is nothing to misconfigure between them.
- No server to operate at all, and free at this size.

**Cons**

- Supabase Auth's account management screens are plainer than Clerk's, and you build more of the sign in surface yourself.
- Hosting on Vercel is a vendor commitment, and moving off it later is real work.

### Option 3: Convex

A reactive database where every query is live by default, so the public board updates itself with no subscription code at all.

**Pros**

- The live update requirement, the hardest part of Slice 1, essentially disappears.
- Excellent TypeScript story end to end.

**Cons**

- Not Postgres. Slice 4's usage reporting across a date range is harder without SQL.
- Least portable of the options, and a smaller ecosystem for an agent to draw on.
- Auth is still a separate decision on top.

### Option 4: Neon Postgres plus an auth library you host, live updates built yourself

Plain managed Postgres with excellent branching, with authentication and the live update path assembled by you.

**Pros**

- Cleanest and most portable database layer, and the least vendor lock in.
- Full control over every piece.

**Cons**

- You build and operate the realtime path yourself, which is the single hardest requirement in the scope.
- More parts for one person to own, for no benefit at this size.

## Rationale

Option 1 was chosen because it is Option 2 with the engineer's two stated preferences applied, and because both preferences are supported paths rather than workarounds.

The Supabase half is settled by the forces in Context rather than by taste. The data is relational and Slice 4 asks a SQL question, which rules Convex out on the strongest requirement of the later slices. Live push is the product, which rules Option 4 out on the hardest requirement of the first slice. Supabase is the only candidate that supplies relational storage, database enforced authorization and a live channel from one free tier, and its realtime broadcast is fired by a database trigger, so the event source is the data itself rather than the application. That matters directly: a court corrected by hand in SQL still reaches every open board.

Clerk over Supabase Auth is the engineer's call, and it was made knowing the cost. It buys better account management and sign in screens with less code, and it costs a token join between two vendors. The design commits to that properly by using Supabase's native third party auth integration, where Supabase verifies Clerk tokens against Clerk's public key endpoint. The older Clerk JWT template approach, which required sharing Supabase's signing secret with Clerk, has been deprecated since April 2025 and is not used here.

Self hosting is likewise the engineer's call. Vercel would have been free and friction free on Next 16, and that tradeoff is recorded plainly in Consequences. Because no provider is committed yet, the decision is written against any Docker capable host using Next.js standalone output, so choosing the provider stays cheap and does not change a line of application code.

Two smaller calls were made rather than asked. First, the public board reads the realtime broadcast on a private channel with an explicit read only policy granting the `anon` role access to that one topic, rather than a plain public channel with a manual broadcast from the Server Action. The private channel keeps the database as the single event source and costs one policy; the manual broadcast would miss any write that does not come from the app. Court rows carry no personal data, so exposing them to anonymous readers is safe by design. Second, race safety is optimistic locking on a `version` column rather than a row lock in a transaction. The board's real risk is a stale tablet silently undoing a recent change, and optimistic locking makes exactly that case visible without holding locks from a serverless request path.

## Landscape check, September 2026

Two web checks were run during the design conversation to keep the options current. What they confirmed:

- **Vercel's own Postgres product is gone**, and that path is now Neon. This removed a candidate that would otherwise have been an obvious default for a Next.js app.
- **Supabase now recommends `realtime.broadcast_changes()` on a private channel** in preference to subscribing directly to Postgres changes, for scaling and for authorization. The spec follows the recommended path, not the older one.
- **The Clerk plus Supabase JWT template is deprecated as of 1 April 2025**, replaced by a native third party auth integration where Supabase verifies tokens from Clerk's JWKS endpoint and no secret is shared. Clerk session data is readable in policies through `auth.jwt()`, with the user id in the `sub` claim.
- **Positioning between the database candidates** was consistent across sources: Supabase where you want auth, storage and realtime already built, Neon where you want the database only, Convex where realtime reactivity matters more than SQL.

Everything above reflects sources current as of September 2026. This category moves fast, so treat any pricing or tier detail as worth confirming before you commit money.

## Cross check, September 2026

An independent model reviewed the drafted spec. It challenged one factual claim and found a set of decisions the build would otherwise have had to invent. All of its findings were accepted and are now architecture rules or explicit deferrals in `index.md`.

The factual challenge was worth having: it doubted that the `anon` role could be granted read access to a **private** realtime topic, and suggested falling back to a plain public channel. Checking Supabase's realtime authorization docs settled it. Policies on `realtime.messages` can be written for the `anon` role and scoped with the `realtime.topic()` helper, the anon key does establish a session with the `anon` role, and the check runs when the websocket joins the channel. The private channel stands, with the public channel kept as a documented fallback.

Its strongest soundness point, which the engineer overruled knowingly, was that Clerk over Supabase Auth is a weak trade for a solo builder, because the reward is nicer sign in screens while the cost is a misconfiguration that fails silently. That tension is recorded in the premise note above and in Consequences. The engineer confirmed Clerk twice, so the design commits to it properly.

Its other point worth recording: deferring all observability to feature 11 is too late for a product whose entire value is freshness. A dead container is a board that is silently wrong. That is why a health endpoint, a restart policy and an external uptime ping are now day one rules rather than part of feature 11.

## Agent skills and MCP servers

Discovery ran with the engineer's consent. Six skills were found and installed into `.claude/skills/`:

| Skill                              | Source                         | Why it matters here                                                                                             |
| ---------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `supabase`                         | `supabase/agent-skills`        | Official. Client usage, the `@supabase/ssr` integration, auth and session handling, realtime.                   |
| `supabase-postgres-best-practices` | `supabase/agent-skills`        | Official. Schema, migrations, row level security policies, indexes, triggers. Load it before any schema change. |
| `clerk-setup`                      | `clerk/skills`                 | Official. The quickstart wiring, so the setup is not guessed at.                                                |
| `clerk-nextjs-patterns`            | `clerk/skills`                 | Official. Middleware, Server Actions and caching with Clerk, which is exactly the write path here.              |
| `tailwind-4-docs`                  | `lombiq/tailwind-agent-skills` | Tailwind 4 removed the JavaScript config file, so version 3 patterns are actively wrong.                        |
| `zod`                              | `pproenca/dot-skills`          | Schema and inference conventions for the validation boundary.                                                   |

Two MCP servers were chosen and are not yet connected, because connecting them is a step only the engineer can do in their own client settings: the Supabase MCP server (read the real schema, run migrations, check policies against the live project) and the Clerk MCP server (inspect real users, sessions and settings). These are recorded in Follow-up.

## References

**Project sources**

- `docs/scope/scope.md`, feature 1 and its done when statement, plus the Tracer Bullet build approach and the Beta workflow tier
- `package.json`, the existing Next.js 16.3.3, React 19.2.8, Tailwind 4 and TypeScript 5 scaffold
- Root `AGENTS.md`, the Next.js agent rules block, which warns that this Next version differs from training data
- The six installed community skills listed above

**Practices and standards**

- Monolith first for a single developer and a single venue
- A relational database as the default for data with clear relationships
- Never build authentication from scratch
- Enforce authorization at the data layer, not in each call site
- Optimistic concurrency control with a version column, in preference to holding locks from short lived requests
- Store timestamps in UTC, display in a single named venue timezone

**Links**, web verified during the design conversation

- Using Realtime with Next.js, Supabase docs: https://supabase.com/docs/guides/realtime/realtime-with-nextjs
- Subscribing to database changes, Supabase docs: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- Clerk third party auth, Supabase docs: https://supabase.com/docs/guides/auth/third-party/clerk
- Integrate Supabase with Clerk, Clerk docs: https://clerk.com/docs/guides/development/integrations/databases/supabase
- Third party auth overview, Supabase docs: https://supabase.com/docs/guides/auth/third-party/overview
- Realtime authorization, Supabase docs, the basis for the anon scoped private channel policy: https://supabase.com/docs/guides/realtime/authorization
- Broadcast and presence authorization, Supabase blog: https://supabase.com/blog/supabase-realtime-broadcast-and-presence-authorization
- Best database for Next.js in 2026, on Vercel Postgres being retired: https://layerbase.com/blog/best-database-for-nextjs-vercel
- Supabase versus Neon versus Convex comparison: https://gautamkhorana.com/blog/serverless-databases-2026-supabase-neon-planetscale-turso-convex/
