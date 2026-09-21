# 0004. Rationale: staff sign in with Better Auth, invite links, and the `staff` row

The reasoning behind [index.md](index.md). `/develop` does not need this file.

**Revised 2026-09-19.** This spec originally chose Clerk (a hosted identity service) as the sign in provider, following spec 0001, and this file recorded why a `staff` row is created by a `security definer` function called with the person's own token. The engineer has since decided to replace Clerk with Better Auth (an authentication library the app hosts itself, with its tables in the project's own Postgres). Every auth decision was reopened from scratch; the `ensure_staff()` mechanism survived on its own merits and is kept. The Clerk era reasoning is summarised under _History_ at the end so the record stays honest.

**Revised 2026-09-21.** Sign in moved from email and password (with optional Google) to username and password. The reason is the venue's: staff share a front desk and do not all keep a personal email they check, and an email nobody reads was only ever a login handle here, so the handle became explicit. Google went with it because it links by email. Everything about the bridge, the invite links and the `staff` row below stands; wherever this file says email, the account's username now plays that part, and Better Auth's required email column holds a placeholder (`<username>@staff.invalid`) that nothing reads.

## Context

> ⚠️ Premise note: on this stack the aligned choice is the platform's own auth. Supabase Auth would verify its own tokens, give `auth.jwt()` for free, invite by email from the dashboard, and keep the "no key in app code can bypass a policy" rule intact. Better Auth is a library the app hosts, and Supabase cannot verify a token it did not issue: its third party auth accepts only Clerk, Firebase, Auth0, Cognito, and WorkOS, with no generic JWKS option (basis: web verified, Supabase third party auth overview). So every design below carries one extra piece, a bridge that turns a Better Auth session into a token Postgres will trust. The engineer chose Better Auth deliberately (own the identity data, no vendor, ready for the self hosted Docker move), and that is a sound reason. The cost is the bridge and one more secret in the app, stated plainly in the Consequences rather than hidden.

The app has a working sign in built on Clerk: `clerkMiddleware` in `proxy.ts`, `auth()` inside `requireStaff()` and `currentStaff()`, a `staffSupabase()` client that hands Clerk's token to Supabase, a `staff` table keyed by `clerk_user_id`, six migrations whose policies and `security definer` functions read `auth.jwt() ->> 'sub'`, Clerk's prebuilt `<SignIn />` and `<SignUp />` cards themed to the design tokens, and a users screen (spec 0012) that manages roles. About sixty files mention Clerk. None of it has real users yet: feature 5 is still `in-progress` in the scope, and every row in the linked project is test data.

Two things have to be true after the change. First, the database must keep working unchanged: every write policy calls `private.is_active_staff()`, every owner gate calls `private.is_owner()`, and both look up a `staff` row by the `sub` claim of the caller's token; `reservation.changed_by`, the audit tables, and the `court_usage` report all hold that same id. Rewriting those is the expensive, error prone path. Second, who may hold an account must be controlled by the owner, not by a public form. Clerk did that with a dashboard setting (Restricted mode and emailed invitations). Better Auth has no dashboard and this project has no email sending service, so the control has to be built into the app, and it has to hold against the raw HTTP endpoints Better Auth exposes, not just against our page.

The forces are unchanged from the first version of this spec: one venue, a handful of staff on phones and a desk tablet, a public board that must stay open with no sign in, sessions long enough that a shift phone rarely asks again, and a non technical owner who should never need the Supabase SQL editor. New forces: hosting is Vercel now and a Docker container later (a serverless runtime cannot keep in memory rate limit counters, and cannot hold a database connection open between requests), the app already has two Supabase clients whose separation is a rule, and the service role key must stay out of application code.

## Options considered

Two decisions were genuinely open: how a Better Auth session becomes something Postgres can read, and how staff accounts come to exist. The smaller calls (methods, session length, Google's rules, the data model details) are recorded in the Rationale.

### The bridge into Postgres

#### Option 1: Mint a short lived Supabase JWT per request

After Better Auth confirms the session cookie, the server signs a small JSON Web Token (a signed claims document) with the Supabase project's JWT secret: `sub` (the Better Auth user id), `role: authenticated`, `email`, `name`, valid for five minutes. `staffSupabase()` hands that token to supabase-js exactly as it handed Clerk's, so `auth.jwt()` inside Postgres sees the same shape it always did.

**Pros**:

- Nothing below `lib/supabase/staff.ts` changes: six migrations, every policy, every `security definer` function, the generated types, the query and action modules all stay as they are.
- The smallest possible slice for the tracer bullet, and the easiest to prove: one function that mints, one test that decodes.
- The token is short lived and carries only the `authenticated` role, so a leaked token is worth five minutes of one staff member's access, the same as before.

**Cons**:

- `SUPABASE_JWT_SECRET` lives in the app's environment, and that secret can sign a `service_role` token. The rule "no key in app code can bypass a policy" stops being an impossibility and becomes a convention held by one module and a test. Postgres still enforces per token; what changes is that app code now holds the means to mint a stronger one.
- It is tied to the project's legacy HS256 secret (a shared secret both sides know). Supabase's newer asymmetric signing keys move away from that secret; if it is ever revoked in the dashboard, every minted token stops verifying. Keeping it active is a documented prerequisite, not a default.
- One more secret to rotate, and rotating it signs everyone out for five minutes.

#### Option 2: Direct Postgres with a scoped role and `set local` claims

Better Auth already needs a `pg` connection pool. Staff reads and writes would use the same pool through a helper that opens a transaction, runs `set local role authenticated`, sets `request.jwt.claims` to the person's claims, and runs the queries. `auth.jwt()` reads exactly that setting, so the policies work unchanged.

**Pros**:

- No secret in app code can bypass a policy. The connecting role is a member of `authenticated` only and cannot escape row level security; a leaked connection string is worth what `authenticated` is worth and no more.
- No PostgREST hop, which suits the self hosted Docker move: one database connection, no API gateway between the app and its data.
- Realtime, the one Supabase feature that needs a token, turned out not to need one here (the `schedule` topic is readable by `anon` and carries no personal data).

**Cons**:

- Six query and action modules move from supabase-js to SQL, the generated `database.types.ts` no longer covers them, and every existing unit test that mocks the query builder is rewritten. Several times the size of this slice.
- Two ways of reading the same tables would exist during the move (the public board through PostgREST, staff through SQL), which is exactly the kind of drift the two client rule was written to prevent.
- Transaction scoped settings only work inside a transaction; every staff read has to be wrapped, and a forgotten wrapper reads as the pool's own role, a silent authorisation bug.

#### Option 3: Better Auth's `jwt` plugin with Supabase verifying its JWKS

Better Auth can publish signing keys at a JWKS endpoint and issue tokens with custom claims (basis: web verified, Better Auth jwt plugin docs), which is how Clerk's integration works underneath.

**Pros**:

- Would be the cleanest mirror of the Clerk setup: no shared secret, tokens verified by Supabase natively.

**Cons**:

- Supabase does not accept a generic JWKS or OIDC provider as a third party auth source (basis: web verified, Supabase third party auth overview). This option does not exist today; recorded so nobody re investigates it.

### How staff accounts come to exist

#### Option A: Owner generated one time links

An owner or superadmin makes a link on the users screen. The link carries a random token whose hash is stored with a role, a seven day expiry, and who made it. The person opens it, types name, email, and a password (or continues with Google), and the token is claimed atomically in the same step that creates the account. The same table and mechanics give a password reset link, bound to one account.

**Pros**:

- Needs no email service, which the project does not have. The link travels by Viber, Messenger, or text, which is how Ella already talks to staff.
- Single use and expiring: a screenshot or a forwarded message goes stale, and a link redeemed once is dead.
- No password is ever sent in a chat, and the owner never knows anyone's password.
- The gate lives inside Better Auth's own account creation hook, so a request straight at `/api/auth/sign-up/email` or a Google callback is refused the same way as our page.
- The users screen already exists (spec 0012); pending links and reset links are one more panel on it.

**Cons**:

- The link is a bearer ticket: whoever opens it first gets the account (the engineer chose role only links, with name and email typed at redemption). The owner sees the resulting account on the users screen and can deactivate it, and the seven day life bounds the window.
- A new table, three Postgres functions, and a hook: more surface than a dashboard checkbox.
- Password reset with no email is also owner mediated, so a forgotten password on a Sunday waits for Ella.

#### Option B: Owner creates the account with a temporary password

The owner types name, email, and a temporary password; Better Auth's admin plugin creates the user; the person signs in and is asked to change the password.

**Pros**:

- Simplest screen and no token table; the admin plugin does the creation.

**Cons**:

- The temporary password travels in a chat and stays valid until changed, and nothing forces the change without more code.
- The owner picks the person's name and email, and gets them wrong.

#### Option C: Email allow list, then self sign up

The owner adds an email; only that email may sign up.

**Pros**:

- No token to hand over and nothing to expire.

**Cons**:

- With no email verification, anyone who knows the address can claim it first. That is a real risk with staff email addresses that are semi public.

#### Option D: Better Auth organization invitations

The organization plugin has invitations built in (basis: web verified, Better Auth organization plugin docs).

**Pros**:

- Documented, tested, and maintained by the library.

**Cons**:

- Sends its invitations by email, which the project cannot do, and brings an organisation and membership model this single venue does not have.

## Rationale

**The bridge: Option 1 now, Option 2 recorded as the end state.** The project's build approach is Tracer Bullet: prove the whole path end to end, narrow but real, before thickening. Option 1 is the only bridge that lets the thread be proven in one slice while the sign up control, the real feature here, gets built and tested. Every policy and function stays untouched, so the risk of the migration concentrates in one new module, `lib/supabase/staff-token.ts`, that a unit test can pin. The engineer chose it with the tradeoff in front of them: `SUPABASE_JWT_SECRET` in the app is a weaker guarantee than "no such key exists", and the spec turns that into a rule with a test (nothing outside that module may import the secret) rather than leaving it as a hope. Option 2 is the better security shape and the better fit for the Docker move, but it is a rewrite of the data access layer, and doing it in the same slice as an identity swap is how a project ends up with two half finished migrations. It is a Follow-up with its own `/architect` run.

**Accounts: Option A.** It is the engineer's own idea, and it survives the comparison. The decisive force is the missing email service: every option that leans on email (C with verification, D) either does not work here or is unsafe here, and B moves a secret through a chat. The engineer chose role only links, so a link is a bearer ticket; that is accepted because the owner hands each link to one person directly, the link dies after seven days or one use, and the resulting account is visible on the users screen. The gate is placed in Better Auth's `databaseHooks.user.create.before` rather than on the sign up endpoint, because Google at redemption (the engineer's choice) means an account can also be created by an OAuth callback, and the database hook is the one place every creation path passes through (basis: `better-auth-best-practices` skill, database hooks).

**Why the invite travels as a cookie and not a form field.** A field in the sign up body would work for the email path only: Better Auth strips fields it was not told about, and the Google callback carries no body of ours at all. A cookie scoped to `/api/auth` reaches the hook on both paths with one piece of hook code, which is worth more than saving a few lines. The one trap, found by the cross check, is that a cookie staged by `cookies().set()` in a Server Action is a response header, not a request header, so the same request's call to `auth.api.signUpEmail()` would never see it. That is why `redeemInvite` builds the `Headers` object by hand and only `beginGoogleRedemption` sets a real browser cookie.

**Bootstrap.** The first account cannot come from an invite because nobody exists to make one. The chosen rule keeps the existing "first person becomes owner" behaviour but closes its race: the hook lets one account through with no invite only while the user table is empty and the email equals `BOOTSTRAP_OWNER_EMAIL`. On a fresh deployment nobody else can take the owner seat by being quick.

**Methods.** Email and password plus Google, as before. Passkeys and magic links were declined: magic links need email, passkeys sit badly on a shared tablet. Google never creates an account on its own (`disableImplicitSignUp`); at invite redemption the invite cookie is what lets the callback through, and for an existing account Google is linked by matching email with Google as a trusted provider, since Google verifies the address itself.

**Session.** 30 days, refreshed daily, with a five minute cookie cache, matching what staff had under Clerk. The cache is why deactivation also revokes sessions: without that, a deactivated person's session would keep validating from the cookie for up to five minutes, and their staff row would be read on each request anyway; revoking makes the cut clean and immediate on the next uncached request.

**Password reset and account sheet.** Reset links reuse the invite table (kind `reset`, bound to one account) so the owner sees one list of pending links and one Revoke. Setting the new password goes through Better Auth's internal adapter (hash with its own `scrypt`, update the credential account, delete every session), because Better Auth's own reset flow assumes an email sender. A small account sheet replaces Clerk's profile modal: change password with the current one, and link or show Google.

**Where Better Auth's tables live.** A `better_auth` schema in the same Supabase Postgres, owned by a dedicated login role `better_auth_app` with rights on that schema only, plus execute on exactly three small `public` functions (`claim_staff_invite`, `claim_staff_reset`, `peek_staff_invite`), which are the only way the auth layer touches anything of ours, and no table at all. PostgREST exposes only the schemas it is told to, so the anon key can never reach a session row. Its SQL is generated by the Better Auth CLI and checked in under `supabase/migrations/`, which keeps the "forward only SQL files applied by the CLI" rule intact (basis: web verified, Better Auth PostgreSQL adapter docs).

**Existing data.** Start clean. Everything in the linked project is pre launch test data; a re key by email would be a one off mapping path that lives forever for nothing.

**What was kept from the Clerk version.** `ensure_staff()`: still parameterless, still reads the token, still bootstraps the owner under an advisory lock, and now also hands a newly created row the role from the invite that created its account. `currentStaff()` with its three way result and three second abort. `requireStaff()` as the first line of every Server Action. Row level security as the enforcement point.

## History: the Clerk era (2026-09-12 to 2026-09-19)

Spec 0001 chose Clerk and wired Supabase to trust its tokens; this spec then weighed three ways a `staff` row could come to exist: a `security definer` function called with the person's own token (chosen), a Clerk webhook on `user.created` (rejected: needs a database credential under `app/`, and webhooks arrive twice, late, or never), and Ella inserting rows by hand (rejected: a mistyped id fails silently at the desk). Sign in methods were email code, password, and Google; Clerk's Restricted mode and emailed invitations controlled who could hold an account; sessions were 30 days. The build reached step 7 of 9: the thin thread, the three states of the staff menu, the signed out surface, presentation, and tests were done; the dashboard prerequisites, the invitation path, and the end to end proof were not.

## References

**Project sources** (verifiable, in this repo):

- `AGENTS.md`: the two Supabase clients rule, the service role key rule, row level security as the enforcement point, forward only SQL migrations, the analytics rule, and the `server-only` import boundary.
- Spec 0001 (stack and architecture): the Supabase token join and the hosting plan (Vercel now, Docker later).
- Spec 0002 (data model): the policy helpers that read `auth.jwt() ->> 'sub'` and the `staff` table.
- Spec 0012 (roles and the users screen): the screen the invite panel joins, `update_staff_role()`, and the superadmin cap.
- Spec 0010 (privacy and retention): the daily purge job and the privacy notice that lists what is kept.
- Installed skills: `better-auth-best-practices`, `better-auth-security-best-practices`, `email-and-password-best-practices` (`better-auth/skills`), `supabase-postgres-best-practices` and `supabase` (`supabase/agent-skills`), `zod`, `vitest`, `tailwind-4-docs`.
- `supabase/migrations/20260905043037_court_schedule.sql`: the `schedule` broadcast policy that lets `anon` read the topic, which is why the staff listener no longer needs a token.

**Practices & standards**:

- Store only a hash of a bearer token; show the plain token once.
- Single use tokens claimed atomically (an `update ... where claimed_at is null returning`) so two redemptions cannot both succeed.
- Enforce sign up control at the one point every creation path passes through, not at the UI.
- Short lived, least privilege tokens for a bridge between systems.
- Tracer Bullet delivery: prove the thread end to end before thickening.

**Links** (web verified on 2026-09-19 by the one research pass; not fetched again since):

- Supabase third party auth overview: https://supabase.com/docs/guides/auth/third-party/overview
- Better Auth with Next.js: https://better-auth.com/docs/integrations/next
- Better Auth PostgreSQL adapter and CLI generate: https://better-auth.com/docs/adapters/postgresql
- Better Auth email and password (including `disableSignUp`): https://better-auth.com/docs/authentication/email-password
- Better Auth options reference (session, account linking, hooks): https://better-auth.com/docs/reference/options
- Better Auth jwt plugin (Option 3, not usable with Supabase today): https://better-auth.com/docs/plugins/jwt
- Better Auth organization plugin (Option D): https://better-auth.com/docs/plugins/organization
