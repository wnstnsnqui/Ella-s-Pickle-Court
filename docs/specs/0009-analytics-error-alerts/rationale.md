# 0009. Analytics and error alerts: rationale

The decision record behind [index.md](index.md). `/develop` does not need this file; it is here so a person can see why the spec says what it says.

## Context

> ⚠️ Premise note: "full product analytics" was chosen for a board that one venue's players glance at and a handful of staff edit. The risk is not cost (the free tier swallows it) but attention: a product analytics tool has a hundred views and Ella needs about seven, and choosing to read them in the vendor's dashboard splits her picture of the venue across two places (court usage lives in `/staff/reports` from spec 0008). The spec answers this by insisting on one curated, pinned dashboard (AC-11) and by keeping the browser surface to page views plus one event. If the split turns out to bother Ella, a small tile in the app reading PostHog's query API is the seam (Follow-up). The direction is sound; the discipline is the dashboard.
>
> This feature also assumes a hosting provider that spec 0001 has not yet picked. Where the container runs decides whether server logs are readable and whether a build secret can be passed for source map upload. Both are stated as constraints and follow ups rather than blocked on.

Feature 11 exists because the app is about to run in front of real people and nobody can see it. Spec 0001 chose, deliberately, to ship no logging or observability stack until this feature: a health endpoint, a restart policy, and a promise of an uptime ping were the whole story. Today there is no `error.tsx`, no `global-error.tsx`, no server side logging beyond a `console.error` in `lib/staff.ts`, and no record of who looks at the public board. If the realtime channel drops on every phone tomorrow, or a Server Action starts answering `failed` on every booking, the first person to know is a player at the counter.

The scope row asks for two things: know whether staff keep the schedule current and whether players use the public page, and be told when something breaks in production without a customer reporting it. The forces pulling on it are specific to this project. The public board is open, phone first, and read by people who did not sign up for anything, so whatever counts them must not need a consent gate, and feature 12 (privacy, terms, cookie notice) is waiting on this decision to know what it must build. The database holds customer names and phones under spec 0002's rules, and nothing personal may leave the box for a vendor. The engineer is one person, self hosting, who does not want a second bill or a second box to keep alive, and who lives in Discord rather than email. The stack is fixed: Next.js 16 on a container, Supabase, Clerk, with `reservation_audit` already recording every booking change in Postgres.

Not deciding has a real cost. Every week without error visibility is a week where the "live board" promise can quietly fail; and the longer the public board runs untracked, the less Ella can say about whether it was worth building.

## Options considered

### Option 1: PostHog Cloud for both analytics and errors, cookieless players, identified staff, Discord alerts

One vendor. `posthog-js` in the browser (cookieless mode on the public board, identified mode on the staff surfaces), `posthog-node` in the Server Actions for booking events, PostHog error tracking for exceptions from `onRequestError`, the error boundaries and the browser SDK, and a Discord webhook destination on new or reopened issues. Ella reads a curated dashboard in PostHog.

**Pros**

- One SDK on the phone, one dashboard, one free tier that covers both halves with room to spare.
- Cookieless mode gives honest daily distinct visitors with nothing stored on the device, so no consent gate.
- `identify()` with a Clerk id gives Ella per staff member activity by name.
- Error tracking, alerting and analytics share the same person and session model, so an error can be traced to the events before it.
- The Node client makes server side booking events reliable and ad blocker proof.

**Cons**

- PostHog's error tracking is younger than Sentry's; grouping and minified stack quality lag until source maps are uploaded.
- Full product analytics is more tool than a one venue board needs; the dashboard has to be curated or Ella drowns.
- Ella's view splits between `/staff/reports` and PostHog.
- A third vendor next to Supabase and Clerk.

### Option 2: Plausible for analytics, Sentry for errors

Plausible's cookieless, privacy first page view analytics with a simple dashboard, and Sentry's mature error tracking with first class Next.js wiring and rich Discord alerts.

**Pros**

- Each is the best in class at its one job; Sentry's Next.js integration, release tracking and alert rules are the most polished available.
- Plausible's dashboard is small enough that Ella needs no curation.

**Cons**

- Two vendors, two SDKs in the browser bundle, two logins for you, and Plausible is paid from the first month.
- Plausible has no real notion of an identified user or custom event properties per person, so "edits per staff member" needs a different home (the database, which contradicts reading everything in one dashboard).
- Two alert pipelines to configure and keep pointing at Discord.

### Option 3: In house, no vendor

A `page_view` table in Postgres written from a Route Handler, staff activity read straight from `reservation_audit`, tiles on `/staff/reports`, and an email or Discord post from `onRequestError` for server errors.

**Pros**

- Nothing new to sign up for, no data leaves the box, everything shows in the app Ella already uses.
- The staff activity numbers would be exact, computed from the audit table the app already writes.

**Cons**

- Browser errors are invisible: no SDK means no stack traces from the phone, and the public board failing silently on a phone is the case most worth catching.
- Counting distinct visitors without a cookie means hashing addresses yourself, with the salt rotation, retention and privacy reasoning that implies; PostHog already did this work.
- Every alert is code you own: deduplication, grouping, flood control. Simple to start, painful the first time a loop posts a thousand messages.
- Writes a page view row per public request into the same database that serves the board, which is exactly the kind of load spec 0006 kept off it.

### Option 4: PostHog for analytics, Sentry for errors

PostHog for the product analytics half (as in Option 1) and Sentry for the error half.

**Pros**

- Sentry's maturity where it matters most, PostHog's analytics where it fits best.
- Sentry's Next.js SDK wires `onRequestError`, error boundaries and source maps in one package.

**Cons**

- Two SDKs in the browser bundle on a phone first board, two vendors, two free tiers to watch.
- Errors and the events leading to them live in different tools, so tracing "what did they do before it broke" means two tabs.
- The extra maturity buys little at this traffic; a venue app produces a handful of distinct errors a month.

## Rationale

Option 1 is the choice because the forces in Context reward consolidation more than best in class. The engineer is one person keeping one small app alive; every extra vendor is a login, a bill to watch and a pipeline to keep pointed at Discord. PostHog covers both halves of feature 11 under one free tier, which no other option does. Its cookieless mode is the direct answer to the public board's constraint: nothing stored on a player's device, so feature 12 shrinks to a notice, and daily distinct visitors are still roughly right. Its `identify()` on a Clerk id is the direct answer to Ella's "are staff keeping it current", by name, in the same dashboard as the page views.

The engineer's stated preferences were followed in full: full product analytics, read in the vendor's dashboard, PostHog for errors, Discord for alerts, uptime skipped. Two of those deserve a plain word. Reading analytics in the vendor rather than the app is the right call for effort (no page to build) at the cost of splitting Ella's view; the spec pays for it with a pinned, curated dashboard rather than pretending the split is free. Skipping uptime is the one place this spec would have chosen differently: PostHog can only report errors from an app that is running, and the failure that hurts most, a stopped container, produces no error at all. It stays as a follow up rather than a build task because the engineer decided so, and it is a ten minute job once the host is known.

Option 3 was the tempting one for privacy, and it loses on the thing the scope row names first: an error in production reaching you without a customer reporting it. Without a browser SDK the public board can fail on every phone while the server looks healthy. Options 2 and 4 buy Sentry's maturity at the price of a second SDK on a phone first page and a second vendor; at this app's error volume that maturity is nice to have, not load bearing, and PostHog's error tracking now covers `onRequestError`, error boundaries and browser exceptions, with alerting on new or reopened issues to Discord, which is the whole requirement.

The privacy design is the part that must not drift. Customer names and phones are the only sensitive data in the system, and this feature is the first time any data leaves Supabase for a third party. That is why properties are an allow list with a strict schema and a unit test rather than a deny list or a vendor side filter, why Postgres `details` and `hint` are stripped from every exception (they echo row values), and why session replay and autocapture are off everywhere rather than masked. A deny list is one forgotten column away from shipping a phone number; an allow list fails closed.

Three smaller calls follow the same logic. Server side booking events, sent after the write and never awaited, are reliable, carry a verified Clerk id, and cannot fail a court change. Person properties ride on the browser `identify()` from the staff layout, where the `staff` row is already in hand, instead of a `staff` read per Server Action. And the ingest rewrite through the app's own domain is not optional on a phone first public page: a good share of mobile browsers block the vendor's hosts, and page views on the public board are exactly the number that would be wrong.

## Evidence

**Discovery, 2026-09-15.** Agent Skills and MCP servers searched after the engineer's consent; cached in `docs/.agent-cache/tool-discovery/posthog.md`. The names the search returned (`integration-nextjs-app-router`, `error-tracking-nextjs`) no longer exist in `posthog/skills`; the repo now publishes `instrument-integration` and `instrument-error-tracking`, which cover the same ground, and those two were installed. Found and not installed: `posthog/posthog-for-claude@posthog-instrumentation` (event naming guidance, broader than needed), `vm0-ai/vm0-skills@discord-webhook` (the webhook is configured in PostHog, not in code). MCP: the official `posthog/mcp` server, noted for Follow-up.

**Repo facts the design rests on.** No `error.tsx`, `global-error.tsx`, `instrumentation.ts` or `instrumentation-client.ts` exists. `lib/actions.ts` builds every `failed` result in `describeDatabaseError()`, and `lib/schedule/queries.ts` builds four more. The `proxy.ts` matcher already excludes `_next` and static extensions and rate limits only `GET /` and `GET /api/schedule`. `lib/env.ts` already models "configured or quietly off" with `clerkConfigured`. `reservation_audit` records every booking change in Postgres, so the database keeps its own exact history whatever the vendor does. Next.js 16's `error.tsx` exposes `retry()` and `error.digest`; `onRequestError`'s `routeType` is one of `render`, `route`, `action`, `proxy` (read from `node_modules/next/dist/docs/`).

**Cross check, 2026-09-15.** An independent read on a different model found six gaps, all applied to `index.md`: the `hours_changed` close times must not pass through `localEndTimeInZone` (the columns are `time`, not instants); `saveCourt` needs a prior row read to tell `renamed` from `note`, and `restored` was missing from the catalog; `currentStaff()` carries no id, so the staff identity reads Clerk's `auth()` too; Clerk's `auth()` is not callable inside `onRequestError`, so the `sub` is decoded from the `__session` cookie unverified; the anonymous `getSchedule()` failures name their own action with no distinct id; and `cookieless_mode: "always"` with exception capture is confirmed against live docs in build step 1. It also noted that a silent drop to zero public views has no alarm, now stated in Consequences.

## Addendum: Discord destination unavailable, switched to Slack (2026-09-16)

The build itself (`/develop`, 2026-09-15/16) landed everything in Option 1 except the alert destination: PostHog has dropped its native Discord integration since this spec was written, so there is no supported way to wire a Discord channel as an Error tracking destination in PostHog's current UI. `/sync` flagged the mismatch on 2026-09-16 after the engineer confirmed the analytics and identity threads live in PostHog but had not yet configured the alert.

This is a substitution, not a reconsideration. Nothing in Context or the Rationale above argued for Discord specifically; the engineer's stated preference was "lives in Discord rather than email" (a communication habit, not a platform requirement), and the actual decision criteria, one destination, alerting on issue created or reopened only, configured entirely inside PostHog with no webhook secret in the repo, are unchanged. The engineer already uses Slack, and PostHog's native Slack integration meets every one of those criteria the same way the (no longer available) Discord integration would have: an OAuth connected workspace inside PostHog's own settings, not a webhook URL to hold anywhere. No runner up comparison was needed; there was exactly one available option that still satisfied the Decision's constraints.

Every place `index.md` named Discord now names Slack: the Summary, AC-8, the Decision's chosen option and its own paragraph, the Security model, Configuration required, the Value sourcing table, the Critical test scenarios, and the Build plan's step 3. The `vm0-ai/vm0-skills@discord-webhook` Follow-up item is closed: it was never applicable to a webhook flow that no longer exists, and no skill is needed for a native, in-PostHog Slack connection either.

