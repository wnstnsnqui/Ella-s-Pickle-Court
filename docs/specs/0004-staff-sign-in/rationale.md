# 0004. Rationale: staff sign in and the `staff` row

The reasoning behind [index.md](index.md). `/develop` does not need this file.

## Context

Feature 5 is the first slice that needs a real person. Spec 0001 chose Clerk for identity and wired Supabase to trust Clerk's tokens, so a Server Action can already write as "whoever this token belongs to" and the database can read that person's Clerk id as `auth.jwt() ->> 'sub'`. Spec 0002 then built every write policy on top of a `staff` table: `private.is_active_staff()` and `private.is_owner()` both look a row up by that Clerk id. The scaffold has `clerkMiddleware` in `proxy.ts`, `requireStaff()` guarding every Server Action, `staffSupabase()` carrying the token, and a `staff` slot in the shell that renders only for a signed in user.

What does not exist is everything a person touches: a sign in screen, a sign out control, and any way a `staff` row comes into being. That last gap is load bearing. The `staff` table has no insert grant for any role, spec 0001 forbids the service role key from reaching `app/` or `lib/`, and spec 0001 pencilled in a Clerk webhook for provisioning without resolving that the webhook would need a database credential the rules do not allow. Until a row exists, a signed in staff member is refused by every policy, which is exactly the situation feature 3 is stuck in: its last build task waits on being able to sign in.

The forces are small team, one venue, staff on phones and a desk tablet, and a public board that must stay open to anyone with no sign in. Accounts must be invite only, because a court schedule has no reason to let strangers register. Sessions should last long enough that a shift phone rarely asks again. The feature is tagged `GA`, so it gets a fresh model review and documentation after it is built. Not deciding this leaves feature 3 unprovable and features 6 and 7 with nothing to authenticate against.

## Options considered

The provider, the token join, and the table shape are settled by specs 0001 and 0002 and were not reopened. The open decision was how a `staff` row comes to exist, which is what the options below weigh. The smaller choices (sign in methods, owner bootstrap, landing page, sign in UI, session length) are recorded in the Rationale.

### Option 1: A `security definer` function called on sign in with the person's own token

A Postgres function `public.ensure_staff()` runs with the privileges of its owner (`security definer`, so it can insert where the calling role cannot) but only ever acts on the row whose id matches `auth.jwt() ->> 'sub'` from the caller's own Clerk token, and takes the name and email from the same token. The app calls it once per request for a signed in person, from the server, through the normal staff Supabase client.

**Pros**:

- No secret in application code, no webhook, no new credential, no call to Clerk's backend API. Honours spec 0001 rule 1 exactly.
- The caller can only create or refresh their own row, and cannot set `role`, `is_active`, name, or email by hand, because the function takes no parameters at all.
- Self healing: a name fixed in Clerk lands on the next page load, and anyone who signed in before the function existed is provisioned the next time they load the board.
- Testable with the real token path already proven in feature 1.

**Cons**:

- One small database round trip per page load by a signed in person. Negligible for a handful of staff, but it is a write on a read path.
- The row appears on first page load, not at account creation. A person invited but never signed in has no row, so an owner cannot pre assign a role before they arrive.
- `security definer` is a sharp tool; the function has to be written carefully (`set search_path = ''`, no caller controlled id).
- The name and email have to be on the session token, which is one more Clerk dashboard setting ("Customize session token") that a fresh environment can forget; the symptom is a clear error on first sign in, not a silent gap.

### Option 2: A Clerk webhook on `user.created` inserts the row

Clerk calls an `app/api/webhooks/clerk` route when an account is created. The route verifies the signature and inserts the row.

**Pros**:

- The row exists the moment the account does, before the person ever loads the board, so an owner could set a role in advance.
- The pattern Clerk documents and the one spec 0001 pencilled in.

**Cons**:

- The route needs a database credential that can insert into `staff`. That is the service role key (forbidden under `app/` by spec 0001 rule 1) or a purpose made restricted key and Postgres role, which is new infrastructure for one insert.
- Webhooks arrive out of order, arrive twice, and can be missed while the server is down, so the route needs idempotency and a replay story before it is trustworthy.
- One more secret (`CLERK_WEBHOOK_SIGNING_SECRET`), one more public endpoint to rate limit, and the row can be missing when a person signs in seconds after accepting the invitation.

### Option 3: Ella inserts each row by hand after inviting

One SQL statement per staff member in the Supabase dashboard, using the Clerk id from the Clerk dashboard.

**Pros**:

- Nothing to build. Role is chosen explicitly per person.

**Cons**:

- A forgotten or mistyped id means a signed in person who can change nothing and no clear reason why, and the failure lands at the desk on a busy day.
- Two dashboards and a copied id for every hire, and nothing keeps `display_name` in step with Clerk.

## Rationale

The service role rule from spec 0001 is the deciding force. It exists so that no request path can ever bypass row level security, and a webhook route is a request path. Option 1 is the only shape that creates the row with the same token the policies already trust, which keeps a single trust boundary: Clerk signs the token, Postgres reads the `sub` claim, and nothing in between holds a key that could write as anyone. Option 2's one real advantage, a row that exists before the first sign in, buys nothing here: a role can be changed after the fact, and the first person to sign in is Ella setting the project up.

The smaller calls, each made in the interview:

- **Sign in methods: email code, password, and Google.** You chose all three. The one time code is the recommended default at the desk (no password to forget, no reset flow to build); the password is there for anyone without phone access; Google is a one tap convenience. Google needs your own Google Cloud OAuth client in production, and Clerk's development instance lends shared credentials until then, so Google ships switched on in development and its production credentials are a follow up.
- **Invitation only.** Clerk's Restricted sign up mode with invitations sent from the dashboard. The dashboard is the admin tool for now; a staff management screen is deferred until it is needed.
- **Owner bootstrap: the first row ever created is the owner.** Role cannot be a parameter (anyone with a valid token could make themselves owner), and a signed Clerk claim (`public_metadata.role` in the session token) is the runner up: it makes Clerk the source of truth for role at the cost of a custom claim to configure and a second place where role lives. First row wins is zero configuration and correct for a single venue Ella sets up. Two people signing in at the same instant are serialised by a transaction level advisory lock inside the function, so there is exactly one owner.
- **Deactivation is belt and braces.** Ella bans the person in Clerk (they cannot sign in) and an owner sets `is_active = false` in the database (every policy refuses them even if the ban is missed). Their bookings keep resolving to a name. The flag is one SQL statement in the Supabase SQL editor for now.
- **Session: 30 days.** Both Clerk session settings, inactivity timeout and maximum lifetime, are set to 30 days in the dashboard, so a shift phone almost never asks again. The tradeoff is that a lost phone stays signed in longer, mitigated by the Clerk ban above.
- **Landing on `/` with staff controls, not a protected `/staff` area.** The recommendation was a `/staff` area, which gives the proxy one clear path to protect. You chose the single board, which is simpler and matches how the venue works: one page for everyone. The consequence is that nothing is protected by route in this feature. That is safe because protection was never a route's job here (`requireStaff()` and the policies are), but feature 6 must decide where the staff grid with customer names lives, and if it gets its own path, that is the moment to add `createRouteMatcher` and `auth.protect()` to `proxy.ts`.
- **Sign in UI: Clerk's `<SignIn />` and `<SignUp />` inside the shell.** Clerk owns the code, password, Google, and invitation ticket flows and every error state, and the components take an appearance. The `@clerk/ui` shadcn theme is the recommended way to map them to the tokens, because the project already runs shadcn and the theme reads the same CSS variables; hand mapped `variables` is the runner up if the theme fights a token.
- **Signed in UI: name plus a sign out button, no `<UserButton />`.** Two small pieces in your own components, fully on brand. Account management (change email or password) opens from the name with `useClerk().openUserProfile()`, Clerk's themed modal, so there is no hosted URL to know per environment.
- **Name and email ride on the session token, not a Clerk API call.** The first draft read them with `currentUser()`, which is a network call to Clerk's backend API on every signed in page render of a page that never caches, and that API is rate limited. The cross check caught it. Instead, Clerk's "Customize session token" setting adds `name` and `email` claims (`{{user.full_name}}` and `{{user.primary_email_address}}`) to the same signed token the policies already trust, so `ensure_staff()` reads them with `auth.jwt()` and takes no parameters. One trust boundary for id, name, and email, and zero extra network calls. The runner up, passing them as parameters from `currentUser()`, is only worth it if the token ever grows too large, which three short claims will not cause.
- **When to sync: once per request from the shell, memoised, and never blocking the board.** A `currentStaff()` helper wrapped in React `cache()` (one call per request however many components ask) calls `ensure_staff()` for a signed in person. The row therefore exists before any write. The staff slot renders inside `<Suspense>` so the board streams while the call runs, and the call carries a 3 second abort so a slow database becomes the error notice rather than a hung page. `requireStaff()` stays a pure Clerk check, and a refused write from an inactive account still surfaces through the existing `42501` mapping as `forbidden`, which keeps the policy as the enforcement point. The alternative of refreshing the row only when `last_signed_in_at` is older than some interval was considered and not taken: it needs a read before the write, and with no lock and no Clerk call on the hot path, one small upsert per render is cheaper than the extra logic.
- **The bootstrap lock is taken only on a first sign in.** The function first checks whether the caller's row exists with a plain select. Only when it does not does it take `pg_advisory_xact_lock(hashtext('staff_bootstrap'))`, re check, and insert. Every later call is a plain update with no lock, so staff page renders never serialise against each other.
- **Token refresh: the Server Action path only.** `staffSupabase()` already asks Clerk for a fresh token per request, so a long lived tab writes fine. The staff realtime `setAuth()` refresh (spec 0001 rule 12) waits for feature 6, which is the first feature with a staff side listener.
