# Analytics and error tracking

## Overview

The PostHog wiring for spec 0009: page views and staff activity for Ella, and error
tracking for you. One vendor, cookieless on the public board, identified under
`/staff`. Everything here is gated on `posthogConfigured` in `lib/env.ts`, which is
false unless a `NEXT_PUBLIC_POSTHOG_KEY` is set AND the runtime is not `next dev`
(`NODE_ENV` `development`); a dev session opts in with
`NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV=true`. So a `next dev` session never reports its
transient compile errors into the production project, and every function in this
folder is a no-op when the gate is false.

## Key files

| File                 | Owns                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `hosts.ts`           | PostHog's US cloud hosts and the `/ingest` rewrite prefix. Constants, not env vars: the region is a decision, not a deploy setting. |
| `properties.ts`      | The event allow list: one `.strict()` Zod schema per event name, plus `scrubError()`. Nothing reaches PostHog that isn't named here first. |
| `server.ts`          | `captureStaffEvent()`, `reportFailure()`, `clerkSubjectFromCookie()`, and the `posthog-node` singleton. Server only (`server-only` import). |
| `register-node.ts`   | The Node.js runtime half of `instrumentation.ts`'s `register()` (the SIGTERM shutdown hook), split out so `process.on` never reaches the Edge Runtime's bundle. |
| `browser.ts`         | `identifyStaff()`, `resetIdentity()`, `captureDayViewed()`: thin `posthog-js` wrappers, all no-ops when unconfigured. |

Root convention files `instrumentation-client.ts` and `instrumentation.ts` (client init and
`onRequestError`) live outside this folder, per Next.js's own convention, but are part of the
same feature.

## Conventions

- **One `.strict()` schema per event in `properties.ts`.** Adding an event means adding a row there first; there is no other way to send one. A property bag that fails its schema is dropped whole, never sent partially.
- **`captureStaffEvent()` fires only after a successful write, and is never awaited by its caller.** Analytics must never change a Server Action's outcome or its latency.
- **`reportFailure()` is for the unnamed `kind: "failed"` branch only.** A named `ActionError` (`conflict`, `forbidden`, `invalid`, `not_found`, `unauthenticated`) is an expected outcome and must never be reported as an exception.
- **Distinct ids are always a Clerk user id or PostHog's own anonymous id, never a shared literal.**
- **The public board stays cookieless; `/staff` and `/sign-in` are identified.** `instrumentation-client.ts` decides the mode once per page load, from `window.location.pathname`.

## Gotchas

- `clerkSubjectFromCookie()` reads the `__session` cookie's `sub` claim without verifying the signature. That is deliberate: `onRequestError` in `instrumentation.ts` runs outside any request store, so Clerk's `auth()` is not callable there, and the value is attribution only, never an authorization check.
- Every `posthog-node` client is created with `flushAt: 1, flushInterval: 0`, so nothing sits in a memory queue when a short lived server function exits.
- PostHog's `cookieless_mode: "always"` also has to be turned on in the PostHog project's own settings; the client side flag alone is silently ignored otherwise.
- The Discord destination named in spec 0009's Decision is no longer available: PostHog dropped its native Discord integration, so the real alert destination is a Slack channel, wired through PostHog's Slack integration instead. The spec's text has not been updated to reflect this (see `/architect` follow up).

## Agent skills

- [instrument-integration](../../.agents/skills/instrument-integration/): `posthog/skills`, SDK install, provider setup, client and server init
- [instrument-error-tracking](../../.agents/skills/instrument-error-tracking/): `posthog/skills`, exception capture, error boundaries, alerts

## Related specs

- [0009 Analytics and error alerts](../../docs/specs/0009-analytics-error-alerts/index.md)

_Drafted by /sync from the introducing change, worth a quick human pass._
