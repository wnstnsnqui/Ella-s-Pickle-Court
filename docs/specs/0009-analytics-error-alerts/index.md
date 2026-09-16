# 0009. Analytics and error alerts

**Date**: 2026-09-15
**Status**: Accepted

## Summary

The app starts telling you two things it cannot tell you today: whether anyone uses it, and when it breaks. Both go to one vendor, PostHog Cloud (a hosted product analytics service that also tracks errors), read in PostHog's own dashboard rather than a new page in the app. Players on the public board are counted without anything being stored on their phones (PostHog's cookieless mode), so no consent banner is needed; signed in staff are identified by their Clerk id so Ella can see who keeps the board current. Every successful booking, closure, court and hours change sends one small event from the Server Action that made it, carrying court and time facts only, never a customer name or phone. Anything that throws on the server or in the browser, and any Server Action that answers "something went wrong", is recorded as an error, and a new error posts to a Slack channel you watch. With no PostHog key the whole thing quietly switches off, so development and the build are untouched.

## Requirements

**User stories**

- As Ella, I want to see how many people look at the public board each day, so that I know whether players actually use it before I promote it further.
- As Ella, I want to see how often each staff member changes the schedule, so that I know the board is being kept current and by whom.
- As Ella, I want to see which screens of the app get used, so that I know which parts earn their keep.
- As the engineer, I want to be told in Slack when the app throws an error in production, so that I fix it before a player or Ella has to report it.
- As a player, I want to read the board without being tracked across visits or asked to accept cookies, because I only came to check a court.
- As a staff member, I expect my booking work to succeed even if the analytics vendor is down, because analytics is never the point of the board.

**Acceptance criteria** (the contract, each independently checkable)

- **AC-1**: Every full page load of the public board (`/`, with or without `?date=`) is recorded in PostHog as a `$pageview` event in PostHog's cookieless mode: `posthog-js` is initialised in `instrumentation-client.ts` with `cookieless_mode: "always"` for any path that is not under `/staff` or `/sign-in`, so nothing is written to cookies, `localStorage` or `sessionStorage` on the visitor's device, and PostHog derives the daily distinct visitor from its own server side hash. Cookieless mode does not support `identify()`, which is why the staff surfaces initialise differently (AC-3). Client side navigations between dates on the board are recorded as further `$pageview` events (the SDK's `history_change` capture, on by default under `defaults: "2026-05-30"`). The PostHog dashboard shows page views and distinct visitors per day for `/`. The browser's `document.cookie` and storage stay free of any `ph_` key after a visit to `/`.
- **AC-2**: Whenever the public board renders a day, the browser sends one `board_day_viewed` event with `day_offset` (an integer: the shown local date minus today's local date in `Asia/Manila`, in days, so 0 is today and 1 is tomorrow), fired on first paint and again each time the shown day changes, and never twice for the same shown day in one page load. This is the only custom browser event on the public board.
- **AC-3**: On the staff surfaces (`/staff` and everything below it) `posthog-js` is initialised in normal mode (`persistence: "localStorage"`, no cookie, `person_profiles: "identified_only"`) and the browser calls `posthog.identify(clerkUserId, { display_name, role })` once per page load from a small client component rendered by a new `app/staff/layout.tsx`, using Clerk's `auth()` for the user id and the `currentStaff()` row for the name and role (active staff only; a switched off or missing row identifies nobody). The Sign out control calls `posthog.reset()` before Clerk signs the person out, so the next person on that browser inherits nothing. Page views under `/staff/*` therefore show up in PostHog against the staff member's Clerk id, with the display name and role as person properties, and the dashboard can list views per path and per person.
- **AC-4**: After a successful write, and only after it, each Server Action in `lib/schedule/actions.ts` sends exactly one server side event through `captureStaffEvent()` in `lib/analytics/server.ts` (a `posthog-node` client), with `distinctId` set to the staff member's Clerk user id: `createReservation` and `createReservations` send `booking_created` or `closure_created` per row written (by `kind`); `updateReservation` sends `booking_edited` or `closure_edited`; `cancelReservation` sends `booking_cancelled` or `closure_cancelled`; `saveCourt` sends `court_changed` with `action` = `created` for an insert, or on an edit reads the prior row's `name` and `note` before the update (the way `updateReservation` reads the stored start) and sends `restored` when `restore` is set, else `renamed` when the name differs, else `note` when the note differs, and nothing at all when neither changed; `retireCourt` sends `court_changed` with `action` = `retired`; `reorderCourts` sends one `court_changed` with `action` = `reordered` and `court_id` null; `saveVenueSettings` sends `hours_changed`. A refused write (any `ok: false` result) sends nothing. Properties are exactly those in the catalog under **Data model sketch**, no more.
- **AC-5**: No event, person property or exception ever carries a customer's name, phone or booking note, an amount, or a Postgres row. Enforcement is an allow list, not a deny list: `lib/analytics/properties.ts` exports one Zod schema per event name whose `z.object` is `.strict()`, `captureStaffEvent()` parses every property bag through the schema for its event and drops the whole event with one `console.warn` if parsing fails, and `scrubError()` in the same module reduces a `PostgrestError` to `{ code, message }` (dropping `details` and `hint`, which echo row values) and a Zod error to its issue paths (never the received values). A unit test asserts that a property bag containing `customer_name`, `customer_phone`, `note` or `amount` is refused for every event, and that `scrubError()` strips `details` and `hint`.
- **AC-6**: An unexpected throw anywhere is recorded in PostHog as an `$exception` with a stack trace: on the server through `instrumentation.ts` exporting `onRequestError`, which under `process.env.NEXT_RUNTIME === "nodejs"` calls `posthog.captureException(err, distinctId, { route_path, route_type, http_method })` with `distinctId` taken from `clerkSubjectFromCookie(request.headers.cookie)` in `lib/analytics/server.ts`, a small pure function that base64 decodes the payload of Clerk's `__session` cookie and returns its `sub` claim without verifying the signature (attribution only, a forged value is harmless), else undefined; Clerk's `auth()` is not callable inside `onRequestError`, which runs outside any request store (Server Components, Route Handlers, Server Actions and Proxy are all covered, `routeType` is one of `render`, `route`, `action`, `proxy`); in the browser through the SDK's exception autocapture (`capture_exceptions: true` in both init modes, and the project's Error tracking exception autocapture setting turned on) plus explicit `posthog.captureException(error)` from two new error boundaries, `app/error.tsx` and `app/global-error.tsx`. Both boundaries render a friendly notice in the spec 0003 design language (a `BoardNotice` with a `CircleAlert` icon for `error.tsx`; `global-error.tsx` carries its own minimal `<html>` and `<body>` and inline colours since it renders outside the root layout), the sentence "Something went wrong on our side", a Try again button that calls Next's `retry()`, a link back to `/`, and the `error.digest` in small text so a report can be matched to the server record. The visitor never sees a blank page or a raw stack.
- **AC-7**: A Server Action or query that answers with `kind: "failed"` is recorded as an `$exception` as well: `describeDatabaseError()` in `lib/actions.ts` and the `failed` branches in `lib/schedule/queries.ts` call `reportFailure(error, { action })` from `lib/analytics/server.ts` (with `action` = `getSchedule`, `getStaffSchedule` or `loadSettings` as the query's own name, and `distinctId` undefined on the anonymous public path), which wraps `scrubError()`'s output in an `Error` named `ActionFailed` with message `<action>: <code> <message>` and captures it with the Clerk id when known. Results of kind `unauthenticated`, `forbidden`, `not_found`, `invalid` and `conflict`, and the `429` from the public read rate limiter, are expected outcomes and are never captured.
- **AC-8**: PostHog's Error tracking alerting is configured with one Slack destination on the channel you name, wired through PostHog's native Slack integration (an OAuth connected workspace, not a manually held webhook URL), firing when an issue is created and when a resolved issue reopens, never per occurrence. The connection lives in PostHog only, never in the repo or the container environment. A deliberate test throw from a hidden route or a one off local production build produces exactly one Slack message with the issue title and a link to the issue.
- **AC-9**: With `NEXT_PUBLIC_POSTHOG_KEY` empty or missing, `analyticsConfigured` in `lib/env.ts` is false, `instrumentation-client.ts` returns before `posthog.init`, `captureStaffEvent()`, `reportFailure()` and `onRequestError` return without contacting anything, and `npm run build`, `npm run check` and the dev server behave exactly as today. In production with the key set, one `console.info` line at first server use says analytics is on. A capture that fails or a PostHog outage never changes an action's result or its latency in a measurable way: `captureStaffEvent()` is not awaited by the action, swallows its own rejection with one `console.warn` per process per minute at most, and the `posthog-node` client is created with `flushAt: 1` and `flushInterval: 0` for events, so nothing sits in a memory queue when the container is stopped. `instrumentation.ts` `register()` installs a `SIGTERM` handler that awaits `posthog.shutdown()` with a 2 second cap.
- **AC-10**: The browser talks only to the app's own domain: `next.config.ts` adds `skipTrailingSlashRedirect: true` and three rewrites, `/ingest/static/:path*` to `https://us-assets.i.posthog.com/static/:path*`, `/ingest/array/:path*` to `https://us-assets.i.posthog.com/array/:path*`, and `/ingest/:path*` to `https://us.i.posthog.com/:path*`; `posthog-js` is initialised with `api_host: "/ingest"` and `ui_host: "https://us.posthog.com"`. The `proxy.ts` matcher excludes `ingest` alongside `_next`, so Clerk and the rate limiter never see ingest traffic, and a unit test in `proxy.test.ts` shows a `POST /ingest/e/` is not rate limited and not redirected. The server side client talks to `https://us.i.posthog.com` directly. Both hosts and the ingest prefix are constants in `lib/analytics/hosts.ts`, not environment variables, because the region is a decision, not a deploy setting.
- **AC-11**: The PostHog project holds one saved dashboard named "Ella's Picklecourt" pinned for Ella, who has her own PostHog login as a project member, with these insights: public page views and distinct visitors per day; `board_day_viewed` broken down by `day_offset`; booking and closure events per day; booking and closure events per staff member (by `display_name`); `court_changed` and `hours_changed` as a timeline; staff page views by path; and the error tracking issue list. Expected outcomes named in AC-7 never appear in the issue list.
- **AC-12**: Session replay, click and form autocapture, surveys, web vitals and heatmaps are off in both init modes (`autocapture: false`, `disable_session_recording: true`, `disable_surveys: true`, `capture_performance: false`, `capture_heatmaps: false`) and the matching project settings in PostHog are off, so the only browser events are `$pageview`, `$pageleave`, `board_day_viewed` and `$exception`. `.env.example` gains `NEXT_PUBLIC_POSTHOG_KEY` with a comment that it stays empty in development, and the `Dockerfile` gains the matching `ARG` and `ENV` so the key is inlined at build time like the other `NEXT_PUBLIC_` values.

## Decision

**Chosen option**: Option 1: PostHog Cloud for analytics and error tracking, cookieless for players, identified for staff, alerts to Slack

One vendor, one browser SDK and one server client cover both halves of feature 11: PostHog product analytics read in PostHog's dashboard, and PostHog error tracking posting new issues to a Slack channel through PostHog's native Slack integration. Nothing new lands in Postgres.

_Amended 2026-09-16: the alert destination is Slack, not Discord. PostHog dropped its native Discord integration after this spec was written and before the alert itself was configured; Slack was already available to the engineer and does the same job (see [rationale.md](rationale.md))._

**Implementation skills**: `instrument-integration` (`posthog/skills`, `.agents/skills/instrument-integration/`) · `instrument-error-tracking` (`posthog/skills`, `.agents/skills/instrument-error-tracking/`) · `clerk-nextjs-patterns` (`clerk/skills`, `.agents/skills/clerk-nextjs-patterns/`) · `zod` (`pproenca/dot-skills`, `.agents/skills/zod/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `tailwind-4-docs` (`lombiq/tailwind-agent-skills`, `.agents/skills/tailwind-4-docs/`)

Decisions made here rather than asked, each with its runner up:

- **Person properties come from the browser identify, not from every server event.** The staff layout already has the `staff` row for the menu, so `identify()` carries `display_name` and `role` for free; the Server Actions send only the Clerk id and PostHog merges on it. Runner up: `$set` on every server event, which costs a `staff` read per action for a value that rarely changes.
- **Init mode is chosen by path at page load.** `instrumentation-client.ts` reads `window.location.pathname` once: under `/staff` or `/sign-in` it initialises identified mode, everywhere else cookieless mode. A staff member who follows the menu link from `/staff` to `/` by client side navigation stays in identified mode for that page load and is counted as a person, not an anonymous visitor; this is accepted and small. Runner up: one mode with a runtime `set_config` switch, which the SDK does not support cleanly for the cookieless flag.
- **`board_day_viewed` is its own event, not a property on `$pageview`.** The SDK fires `$pageview` at init, before the board component knows which day it shows, and cookieless mode has no persistence for a registered super property to ride on. A tiny event from the board component is simpler and exact. Runner up: parsing `?date=` out of `$current_url` inside PostHog, which cannot do date arithmetic against "today in Manila".
- **`lead_time_hours` is a signed whole number.** `round((starts_at - now()) / 1 hour)` at creation; negative for an owner's backfilled past booking, which is itself informative. Runner up: clamping at 0, which hides backfills.
- **Hosts are constants, the key is an environment variable.** The project API key is public by design (it ships in the browser bundle), so `NEXT_PUBLIC_POSTHOG_KEY` is the only new setting; the US hosts and the `/ingest` prefix live in `lib/analytics/hosts.ts`. Runner up: `NEXT_PUBLIC_POSTHOG_HOST` as well, which invites a mismatched rewrite.
- **Source map upload waits.** `@posthog/nextjs-config` uploads source maps at build time but needs a personal API key inside the Docker build, and the host that runs that build is still an open follow up from spec 0001. Grouped issues with minified browser frames are good enough to be alerted on; server frames are readable without upload. Runner up: shipping the upload now with the key as a build secret, decided once the host is known.
- **Development sends nothing by leaving the key empty.** Gating on the key alone (your pick) rather than also on `NODE_ENV` keeps one honest way to prove the wiring: a local `npm run build && npm start` with the key set, used once per slice in the Build plan.
- **Error tracking alert scope is "issue created or reopened" only.** PostHog's spike alerts are not turned on; at this traffic a spike is a new issue anyway. Runner up: adding a spike alert later if a deploy ever floods an existing issue.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**

Nothing changes in Postgres. The model is the PostHog event catalog, sent from the app, and it is the target `/develop` builds to. Every property listed is the complete set for that event (AC-5).

| Event | Sent from | Distinct id | Properties |
|---|---|---|---|
| `$pageview`, `$pageleave` (public board) | browser, cookieless mode | PostHog's daily salted hash, nothing stored on the device | SDK defaults only: `$current_url`, `$pathname`, `$referrer`, device and browser class |
| `board_day_viewed` | browser, public board component | same hash | `day_offset` integer |
| `$pageview`, `$pageleave` (`/staff/*`) | browser, identified mode | Clerk user id | SDK defaults only |
| `booking_created`, `booking_edited`, `booking_cancelled` | Server Action, after the write | Clerk user id | `reservation_id` bigint, `court_id` bigint, `court_name` text, `kind` = `booking`, `action` = `created` or `edited` or `cancelled`, `starts_at` and `ends_at` as UTC ISO strings, `duration_minutes` integer, `lead_time_hours` integer (created only), `payment_status` is **not** sent |
| `closure_created`, `closure_edited`, `closure_cancelled` | Server Action | Clerk user id | same as above with `kind` = `closure`, no `lead_time_hours` |
| `court_changed` | Server Action | Clerk user id | `court_id` bigint or null (null for `reordered`), `court_name` text or null, `action` = `created` or `renamed` or `note` or `restored` or `retired` or `reordered` |
| `hours_changed` | Server Action | Clerk user id | `weekday_open`, `weekday_close`, `weekend_open`, `weekend_close` as `HH:MM` text sliced from the row's `time` values (Postgres stores `24:00:00`, so a midnight close reads `24:00`), `slot_minutes` integer, `booking_horizon_days` integer |
| `$exception` | browser SDK, error boundaries, `onRequestError`, `reportFailure()` | hash, Clerk id, or none | SDK exception fields (type, message, stack); server adds `route_path`, `route_type`, `http_method`; `reportFailure()` adds `action`, `code`; Postgres `details` and `hint` removed, Zod issues reduced to paths |
| Person (staff only) | browser `identify()` | Clerk user id | `display_name` text, `role` = `staff` or `owner` |

Never sent, from anywhere: `customer_name`, `customer_phone`, `note`, `amount`, any `old_row` or `new_row`, any request body.

**State transitions**: none. Events are append only facts; PostHog's error issues have their own open, resolved and reopened states managed in PostHog.

**API surface**

No new HTTP endpoints of our own. The surface is three internal modules, two Next.js convention files, a rewrite block and two error boundaries.

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `instrumentation-client.ts` | Next.js client convention file | `window.location.pathname`, `NEXT_PUBLIC_POSTHOG_KEY` | `posthog.init` in cookieless or identified mode, or nothing when unconfigured | none (browser) | none; the SDK never throws to the page |
| `instrumentation.ts` | Next.js server convention file | `register()` (SIGTERM hook), `onRequestError(err, request, context)` | `captureException` with route facts and the Clerk `sub` when present | none | never rethrows; failures go to `console.warn` |
| `lib/analytics/server.ts` | server only module | `captureStaffEvent(distinctId, event, props)`, `reportFailure(error, { action, distinctId? })`, `analyticsServer()` singleton | fire and forget capture; boolean "sent" for tests | called only after `requireStaff()` has passed | drops the event with one warn when the props fail the allow list (AC-5) |
| `lib/analytics/properties.ts` | shared module | a property bag per event | the strict Zod schema per event, `scrubError()` | none | Zod parse failure means the event is dropped, never sent partially |
| `lib/analytics/browser.ts` | client module | `identifyStaff({ id, display_name, role })`, `resetIdentity()`, `captureDayViewed(dayOffset)` | thin wrappers over `posthog-js` that no op when unconfigured | browser | none |
| `components/analytics/staff-identity.tsx` | client component in `app/staff/layout.tsx` | `staffId`, `displayName`, `role` from `currentStaff()` | one `identify()` per page load | signed in, active staff | renders nothing |
| `app/error.tsx`, `app/global-error.tsx` | Next.js error boundaries | `error`, `retry` | friendly notice, capture to PostHog | none | none |
| `next.config.ts` rewrites | Next config | `/ingest/*` | forwarded to PostHog US hosts | none | none |
| `proxy.ts` matcher | Proxy config | excludes `ingest` | ingest traffic skips Clerk and the rate limiter | none | none |

**Value sourcing** (every value an action produces or an AC needs, and where it comes from)

| Action | Value produced or displayed | Source |
|---|---|---|
| public `$pageview` | distinct visitor per day | PostHog cookieless hash, decided by `cookieless_mode: "always"` in `instrumentation-client.ts`; no app value |
| `board_day_viewed` | `day_offset` | derived: `daysBetween(todayInZone(VENUE_TIMEZONE), grid.date)` in `lib/time.ts`, using the shown `grid.date` the board already receives from `getSchedule()` (spec 0006) |
| `identifyStaff` | Clerk user id | Clerk's `auth()` `userId` in `app/staff/layout.tsx` (`currentStaff()` returns no id) |
| `identifyStaff` | `display_name`, `role` | `currentStaff()` in `lib/staff.ts`, read by the new `app/staff/layout.tsx` (spec 0004) |
| `resetIdentity` | when to reset | the Sign out control in `components/staff-controls.tsx`, before Clerk's `signOut()` |
| `booking_*`, `closure_*` | `distinctId` | `staff.staffId` from `requireStaff()` (spec 0001, rule 11) |
| `booking_*`, `closure_*` | `reservation_id`, `court_id`, `kind`, `starts_at`, `ends_at` | the row returned by the write's `.select()` (`ReservationRow`) |
| `booking_*`, `closure_*` | `court_name` | the `court` row: `createReservation` already loads settings, add a `court` name read by id on the same client, or the court list the action already holds (`createReservations`, `updateReservation`) |
| `booking_*`, `closure_*` | `duration_minutes` | derived: `(ends_at - starts_at)` in whole minutes |
| `booking_created` | `lead_time_hours` | derived: `round((starts_at - now) / 3_600_000)`, `now` taken once at the top of the action |
| `booking_*`, `closure_*` | `action` | the Server Action name that ran (`created`, `edited`, `cancelled`) |
| `court_changed` | `action` | `saveCourt`: `created` when no id was given; on an edit, a `select("name, note")` of the prior row before the update, then `restored` if `restore`, else `renamed` if `name` differs, else `note` if `note` differs, else no event; `retireCourt`: `retired`; `reorderCourts`: `reordered` |
| `court_changed` | `court_id`, `court_name` | the written `court` row; null for `reordered` |
| `hours_changed` | the six settings values | the written `venue_settings` row as returned by `.select()`; the four `time` columns arrive as `HH:MM:SS` strings and are sliced to `HH:MM` (`24:00:00` becomes `24:00`); never passed through `localEndTimeInZone`, which expects an instant |
| `onRequestError` | `route_path`, `route_type`, `http_method` | the `request` and `context` arguments Next passes (`context.routePath`, `context.routeType`, `request.method`) |
| `onRequestError` | `distinctId` | `clerkSubjectFromCookie(request.headers.cookie)`: the unverified `sub` of the `__session` cookie payload, undefined when absent (never a shared literal, per the PostHog skill) |
| `reportFailure` | `distinctId` | the caller passes `staff.staffId` from `requireStaff()` when it has one; undefined on the anonymous `getSchedule()` path |
| `reportFailure` | `action`, `code`, `message` | the caller passes `action` (its own function name); `code` and `message` from `scrubError(PostgrestError)` |
| `error.tsx` | digest shown to the visitor | `error.digest` from the boundary props |
| Slack message | issue title and link | PostHog's alert destination; no app value |
| dashboard "edits per staff member" | `display_name` | PostHog person property set by `identifyStaff`, joined by PostHog on the Clerk id |
| everything | on or off | `analyticsConfigured = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)` in `lib/env.ts`, mirroring `clerkConfigured` |

**Key invariants**

1. Analytics never changes an outcome: a Server Action's `ActionResult` is computed before any capture, capture is not awaited, and a capture failure is swallowed with a warning. Enforced in `captureStaffEvent()` and by the "after the write, only on `ok`" placement in every action.
2. Nothing personal about a customer leaves the box: every property bag passes a `.strict()` allow list, `scrubError()` drops Postgres `details` and `hint`, and the public board writes nothing to the visitor's storage. Enforced in `lib/analytics/properties.ts` with a unit test.
3. One event per successful write, zero per refused write. Enforced by placement and a unit test per action using a mocked `captureStaffEvent`.
4. Distinct ids are always a Clerk user id or PostHog's own anonymous value, never a made up shared string.
5. The service role key is still nowhere near this: both PostHog clients use the public project key, and `lib/analytics/server.ts` imports `server-only`.
6. No PostHog configuration is read from the database and no PostHog data is written to it. If a future feature wants analytics in the app, it queries PostHog, not Postgres.

**Security model**

- The PostHog project API key is public by design and ships in the browser bundle; it can only write events, never read them. The personal API key (needed only for source maps or the MCP server) is not part of this feature and never enters the repo or the container.
- Server events are sent only from inside Server Actions that have passed `requireStaff()`, so the `distinctId` is a verified Clerk id. Row level security is untouched; this feature grants nothing new in Postgres.
- The public board records anonymous, cookieless page views. No identifier is stored on the device, so no consent gate is required; feature 12 owes a privacy notice line stating that anonymous usage counts are collected through PostHog, and that staff activity is recorded by name.
- Staff are identified by name and role to the vendor. They are employees using a work tool; note it in the privacy page under feature 12.
- Reading the analytics: Ella and you, as members of the PostHog project. Nobody in the app can reach PostHog data; there is no in app surface.
- Alerts: the Slack connection is held entirely inside PostHog's destination settings, through its native Slack integration; no webhook URL or token exists to leak from the repo or the container. The Slack channel itself is private to you.
- Compliance: the venue holds customer names and phones (spec 0002); this feature is designed so that none of it reaches a third party. Philippine Data Privacy Act scope stays where it was (the database), and feature 12 documents the notice.

**Configuration required**

- `NEXT_PUBLIC_POSTHOG_KEY`: the PostHog project API key. Empty in development (nothing is sent). A `Dockerfile` `ARG` and `ENV`, inlined at build time like the other `NEXT_PUBLIC_` values. Also read on the server by `lib/analytics/server.ts`.
- Constants, not settings, in `lib/analytics/hosts.ts`: `POSTHOG_INGEST_PREFIX = "/ingest"`, `POSTHOG_API_HOST = "https://us.i.posthog.com"`, `POSTHOG_ASSETS_HOST = "https://us-assets.i.posthog.com"`, `POSTHOG_UI_HOST = "https://us.posthog.com"`.
- Prerequisites outside the repo, done once in the PostHog UI (US cloud): create the project; turn on Error tracking exception autocapture; turn off session replay, autocapture, surveys, heatmaps and web vitals at project level; connect PostHog's native Slack integration and add the Slack alert destination (issue created or reopened) on your chosen channel; invite Ella as a project member; build the dashboard in AC-11.

**Critical test scenarios** (each maps to an acceptance criterion)

- Happy path, browser: load `/` in a production build with the key set; a `$pageview` and one `board_day_viewed` with `day_offset` 0 appear in PostHog's activity feed, and DevTools shows no cookie and no storage key starting with `ph_`, verifies **AC-1**, **AC-2**.
- Happy path, server: as staff, book a court; PostHog shows one `booking_created` against that Clerk id with the catalog properties and nothing else, and the person shows the display name and role after a visit to `/staff`, verifies **AC-3**, **AC-4**.
- Scrubbing: unit test feeds `captureStaffEvent` a `booking_created` bag with `customer_phone` added; the event is refused and a warning logged; `scrubError` on a `PostgrestError` with `details` returns only `code` and `message`, verifies **AC-5**.
- Failure case, vendor down: with the API host pointed at an unroutable address in a test, `createReservation` still returns `ok: true` in the same order of time and logs one warning, verifies **AC-9**.
- Failure case, unexpected throw: a hidden test route that throws produces an `$exception` with `route_type` = `route` and exactly one Slack message; a second throw of the same error produces no second message, verifies **AC-6**, **AC-8**.
- Failure case, typed failure: force a `failed` result (a stubbed `PostgrestError` with code `XX000` and a `details` string); an `ActionFailed` exception appears with `action` and `code` and no `details`; a `slot_taken` conflict produces nothing, verifies **AC-7**.
- Off switch: with the key unset, `npm run check` passes, the dev server boots, and a spy on `posthog-node` shows zero calls through a booking, verifies **AC-9**.
- Routing: `proxy.test.ts` shows `POST /ingest/e/` from a rate limited address is neither `429` nor redirected, and `GET /` is still limited, verifies **AC-10**.
- Auth and identity: sign out on a staff browser then load `/staff` as a second person; PostHog shows the second person's events on their own id with no `$identify` merge to the first, verifies **AC-3**.
- Configuration: session replay, autocapture and surveys are off in the SDK config unit test and in the project settings screenshot kept with the verify notes, verifies **AC-12**.

## Build plan

Ordered for Tracer Bullet: prove one anonymous page view lands in PostHog through our own domain first, then one server event, then one error reaching Slack. Only then thicken each thread. No migration at any point.

1. Thin browser thread: `npm install posthog-js posthog-node`; `analyticsConfigured` in `lib/env.ts`; `lib/analytics/hosts.ts`; the rewrites and `skipTrailingSlashRedirect` in `next.config.ts`; the `ingest` exclusion in the `proxy.ts` matcher with its test; `instrumentation-client.ts` choosing cookieless or identified mode by path with `capture_exceptions: true`, `autocapture: false`, replay, surveys, heatmaps and performance off, `api_host: "/ingest"`; `.env.example` and `Dockerfile` entries. Before writing the init, confirm against PostHog's live docs (the cached skill files do not cover it) that `cookieless_mode: "always"` sends `$exception` events from `capture_exceptions`; if it does not, public board exceptions are captured from `app/error.tsx` only and AC-6 is amended to say so. Prove the thread with a local production build: one `$pageview` for `/` in PostHog, no `ph_` storage on the device, satisfies **AC-1**, **AC-10**, **AC-12** (SDK side), **AC-9** (off switch: the same build with the key unset sends nothing).
2. Thin server thread: `lib/analytics/properties.ts` with the `booking_created` schema and `scrubError()`; `lib/analytics/server.ts` with the singleton (`flushAt: 1`, `flushInterval: 0`), `captureStaffEvent()` and its allow list gate; wire `createReservation` only. Prove one `booking_created` in PostHog against a Clerk id, satisfies **AC-4** (first event), **AC-5** (gate exists), **AC-9** (fire and forget).
3. Thin error thread: `instrumentation.ts` with `register()` (SIGTERM shutdown) and `onRequestError`; `app/error.tsx` and `app/global-error.tsx` with capture and the friendly notice; `reportFailure()` wired into `describeDatabaseError()`; the Slack destination created in PostHog through its native Slack integration; exception autocapture turned on in the project. Prove it with one deliberate throw from a temporary route (deleted after) producing one Slack message, satisfies **AC-6**, **AC-7** (first path), **AC-8**.
4. Thicken events: the remaining schemas in `properties.ts` (`closure_*`, `booking_edited`, `booking_cancelled`, `court_changed`, `hours_changed`); wire `createReservations`, `updateReservation`, `cancelReservation`, `saveCourt`, `retireCourt`, `reorderCourts`, `saveVenueSettings`; the court name lookup; `reportFailure()` in the `failed` branches of `lib/schedule/queries.ts`; unit tests per action (one event on `ok`, none on refusal) and the allow list refusal tests, satisfies **AC-4**, **AC-5**, **AC-7**.
5. Identity and the day event: `app/staff/layout.tsx` rendering `StaffIdentity` from `currentStaff()`; `lib/analytics/browser.ts`; `resetIdentity()` in the Sign out control; `captureDayViewed()` in the public board component keyed on `grid.date`, with `day_offset` from `lib/time.ts`, satisfies **AC-2**, **AC-3**.
6. The PostHog project itself: project settings off for replay, autocapture, surveys, heatmaps, web vitals; invite Ella; build and pin the dashboard; confirm expected outcomes are absent from the issue list after a day of real use; record the settings in `verify.md`, satisfies **AC-11**, **AC-12**.

## Consequences

**Positive**

- You learn about a broken public board from Slack, not from Ella's phone.
- Ella can answer "does anyone use this" and "is the board kept current" herself, by name, without you.
- No consent banner on the public board, and feature 12 shrinks to a notice.
- One vendor, one browser script (a few tens of kilobytes on a phone), one free tier, one login for Ella.
- No new tables, no new policies, no new attack surface in Postgres.
- The allow list makes "nothing personal leaves" a test, not a hope.

**Negative and tradeoffs**

- Ella's picture of the venue is now split: court usage in `/staff/reports` (spec 0008), audience and activity in PostHog. Two places to look, two visual languages.
- Full product analytics for a one venue board is more than it needs; most of PostHog's surface will sit unused, and the dashboard needs curating so Ella is not lost in it.
- PostHog's error tracking is younger than Sentry's. Grouping and stack quality on minified browser frames will be rougher until source maps are uploaded (Follow-up).
- Nothing tells you the site is down. PostHog sees errors from a running app; a stopped container is silence. Uptime monitoring was skipped on purpose and stays on the spec 0001 follow up list.
- Nothing tells you when public views drop to zero either: a broken `instrumentation-client.ts` or a blocked `/ingest` path looks like an empty day, not an error. Ella's dashboard is the only alarm, so a glance at it after each deploy is part of the routine.
- Cookieless distinct visitor counts reset daily and undercount slightly when several players share an address and phone model; return visits cannot be seen at all.
- Staff are identified by name to a third party. Fair for a work tool, but it belongs in the privacy page.
- One more vendor that can change pricing or terms; the free tier is generous today (roughly a million events and a hundred thousand exceptions a month) and this venue will use a sliver of it.

**Neutral**

- `instrumentation-client.ts` and `instrumentation.ts` are new Next.js convention files at the repo root; read `node_modules/next/dist/docs/` for their contracts, including `onRequestError`'s `routeType` values and the fact that its `request` is a plain object with `path`, `method` and `headers`, not a request store.
- The first `app/error.tsx` and `app/global-error.tsx` land with this feature; every later page inherits them.
- `app/staff/layout.tsx` is new; the staff pages keep their own `currentStaff()` checks, the layout only adds identity.
- A local production build (`npm run build && npm start` with the key set) becomes the way to prove analytics wiring, since development sends nothing.

## Follow-up

- [ ] Upload source maps at build time with `@posthog/nextjs-config` once the hosting provider and its build secrets are decided (spec 0001 follow up). Until then browser stack traces are minified.
- [ ] Uptime monitoring is still owed (spec 0001 asked for it from day one; skipped here on purpose). Better Stack's free tier on `/api/health` posting to the same Slack channel is the cheap answer.
- [ ] Connect the official PostHog MCP server (`posthog/mcp`) so the agent can read insights and error issues while building and debugging: a user config step with a personal API key, US region, per its README; flag for the `MCP servers:` line in root `AGENTS.md`.
- [ ] `instrument-integration` and `instrument-error-tracking` (`posthog/skills`) are installed but not yet in root `AGENTS.md` `## Agent skills`; they are project wide (the client init and the server capture touch root convention files and `lib/actions.ts`). A new `lib/analytics/AGENTS.md` should carry the allow list rule and the "never await capture" rule for anyone working in that folder.
- [ ] Feature 12 must state: anonymous cookieless usage counts through PostHog on the public board; staff activity recorded by name; no customer data shared. Point it at this spec's Security model.
- [ ] Root `AGENTS.md` `## Rules` should gain one line once built: every Server Action sends its analytics event only after a successful write, through `captureStaffEvent()`, and never awaits it.
- [ ] Turn on PostHog spike alerts if a deploy ever floods an existing issue without creating a new one.
- [ ] If Ella wants audience numbers next to court usage, a small tile on `/staff/reports` could read PostHog's query API server side; a new decision, not part of this spec.
- [x] `vm0-ai/vm0-skills@discord-webhook` and `posthog/posthog-for-claude@posthog-instrumentation` were found and not installed; recorded as declined in root `AGENTS.md` (`/sync`, 2026-09-16). The Discord skill is now doubly moot: PostHog dropped its native Discord integration before the alert was configured, so the destination is Slack, wired through PostHog's own Slack integration with no code or skill involved either way.
