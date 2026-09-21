# Staff identity with Better Auth

## Overview

Spec 0004 (revised): staff sign in with a username and a password through Better Auth,
which runs inside the app and keeps its tables in the `better_auth` schema of the
project's own Postgres. No account exists without a one time link an owner or
superadmin made, except the single bootstrap account. Better Auth owns identity and
sessions only; the role and the active flag stay on `public.staff`, and row level
security stays the enforcement point. The bridge to Supabase is a short lived token the
server mints per request in `lib/supabase/staff-token.ts`.

The area spans three folders: this one (the server side), `lib/auth.ts` and
`lib/auth-client.ts` beside it (the Better Auth instance and its browser client), and
`components/auth/` (the forms) behind `app/sign-in/`, `app/sign-up/`, `app/reset/` and
`app/staff/account/`. The HTTP handler is `app/api/auth/[...all]/route.ts`.

## Key files

| File                  | Owns                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `../auth.ts`          | The `betterAuth()` instance: username plugin, 30 day sessions with a five minute cookie cache, database backed rate limiting, `nextCookies()` last, and the `user.create.before` hook. Refuses to load in production without `BETTER_AUTH_SECRET`. |
| `../auth-client.ts`   | The browser client (`createAuthClient` with the username plugin) the forms call.                                                                                                                       |
| `session.ts`          | `currentSession()` and `currentSubject()`, the one session read per request behind React `cache()`. A Better Auth failure reads as signed out, never as a crash.                                       |
| `gate.ts`             | `allowUserCreation()`, the invite gate inside the create hook: a signed `staff_invite` cookie claiming a pending invite for this username, or the bootstrap username while no user exists. Everything else is refused with `STAFF_ONLY_LINE`. |
| `pool.ts`             | `authPool()`, the one `pg` pool as the `better_auth_app` role, plus the three `public` functions that role may call (`claim_staff_invite`, `claim_staff_reset`, `peek_staff_invite`) and the user count. |
| `actions.ts`          | `redeemInvite()` and `resetPassword()`, the two Server Actions that run before any session exists.                                                                                                     |
| `invite-cookie.ts`    | The `staff_invite` cookie: token hashing, signing and verifying with `BETTER_AUTH_SECRET`.                                                                                                             |
| `schemas.ts`          | The Zod schemas for the forms and the two actions.                                                                                                                                                     |
| `constants.ts`        | Username and password bounds, `placeholderEmail()`, `STAFF_ONLY_LINE`, and the `STAFF_HOME` and `ACCOUNT_PAGE` paths.                                                                                  |

## Conventions

- **Sign in is by username, never by email.** The email Better Auth insists on is `placeholderEmail(username)`, nothing reads it, and the gate refuses any other value. Usernames are fixed once chosen: the `staff` row, the invite claim and the placeholder all key on them.
- **Every account creation path passes through `allowUserCreation()`**, our own form and a raw request to `/api/auth/sign-up/email` alike. The gate is the hook, not the form.
- **`redeemInvite()` and `resetPassword()` are the one named exception to "every Server Action calls `requireStaff()` first."** The person has no session yet; a link claimed atomically in Postgres is their gate. They keep the rest of the shape: Zod first, a typed result, analytics only after success.
- **`lib/auth/pool.ts` is imported only by `lib/auth.ts`, `lib/auth/actions.ts` and the three public auth pages.** `lib/import-boundaries.test.ts` fails on any other importer. The pool cannot read a court, a booking or a staff row, so it is never a way around `staffSupabase()`.
- **Server Actions and Server Components read the session through `currentSession()`**, never by calling `auth.api.getSession()` themselves, so a request reads it once. `instrumentation.ts`'s `onRequestError` is the exception, because it runs outside any request store.
- The three link events (`staff_invite_created`, `staff_invite_revoked`, `staff_invite_redeemed`) and `staff_password_changed` are on the allow list in `lib/analytics/properties.ts`; the writes that fire them live in `lib/staff/actions.ts` and here.

## Gotchas

- `nextCookies()` must be the last plugin, or a Server Action's `auth.api.*` call sets no cookie on the response.
- The invite token reaches the create hook as the signed cookie inside a `Headers` object `redeemInvite()` builds by hand. A cookie staged with `cookies().set()` in the same request is not visible to the hook.
- A link claimed by a call whose response was then lost is burnt on purpose; the owner makes a new one.
- `authPool()` uses `max: 3` because `BETTER_AUTH_DATABASE_URL` points at Supavisor in transaction mode on Vercel, where many small pools add up.
- In development with no `BETTER_AUTH_SECRET` the module still loads so the public board boots (Better Auth falls back to an in memory store and warns). `authConfigured` in `lib/env.ts` is the switch the rest of the app reads.
- Two one time steps after the first push of the Better Auth migrations: set the `better_auth_app` role's password by hand and put it in `BETTER_AUTH_DATABASE_URL`, and copy the project's legacy JWT secret into `SUPABASE_JWT_SECRET`. The README's environment table has the full list.

## Agent skills

- [better-auth-best-practices](../../.agents/skills/better-auth-best-practices/): `better-auth/skills`, server and client config, adapters, sessions, plugins
- [better-auth-security-best-practices](../../.agents/skills/better-auth-security-best-practices/): `better-auth/skills`, rate limiting, secrets, trusted origins, cookies
- [email-and-password-best-practices](../../.agents/skills/email-and-password-best-practices/): `better-auth/skills`, the credential provider under the username plugin, password policy and reset

## Related specs

- [0004 Staff sign in with Better Auth, invite links, and the `staff` row](../../docs/specs/0004-staff-sign-in/index.md)

_Drafted by /sync from the introducing change, worth a quick human pass._
