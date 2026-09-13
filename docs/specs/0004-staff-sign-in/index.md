# 0004. Staff sign in and the `staff` row

**Date**: 2026-09-12
**Status**: In Progress

## Summary

Staff sign in with Clerk (the identity service spec 0001 chose), using an email code, a password, or Google, and only people Ella has invited from the Clerk dashboard can have an account. The moment a signed in person loads the board, a small database function creates or refreshes their `staff` row from their own signed token (which carries their id, name, and email), so no secret key, no webhook, and no extra call to Clerk are needed, and the very first person to sign in becomes the owner. Signed in staff land on the public board with their name and a sign out button in the header; a signed out visitor sees only a quiet footer link. Nothing here decides who may change the schedule: the row level security policies (rules in Postgres that decide who may touch each row) from spec 0002 still do that, and this feature is what gives them a row to read.

## Requirements

**User stories**:

- As a staff member, I want to sign in once on my phone and stay signed in through my shifts, so that keeping the schedule current takes no extra steps.
- As a staff member, I want to sign out when I hand a shared tablet to someone else, so that my name is not on their changes.
- As Ella, I want to invite each staff member myself and be the owner from the start, so that nobody I did not choose can touch the schedule and I can do the owner only things.
- As Ella, I want a leaver switched off without deleting anything, so that their past bookings still show who made them.
- As a player, I want the board to stay open with no sign in and no clutter, so that checking a court takes a second.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: An invited person can create their account at `/sign-up` from the invitation link and then sign in at `/sign-in` by email plus a one time code, email plus a password, or Google. An address that was never invited is refused by Clerk on both pages, and the page says the board is for staff and to ask Ella for an invitation.
- **AC-2**: A signed in session survives a page refresh and a closed and reopened browser, and stays valid for up to 30 days before asking again.
- **AC-3**: On every page load by a signed in person, a `staff` row for their Clerk id exists: created on the first load, refreshed on every later one. `display_name` and `email` mirror the `name` and `email` claims on the Clerk session token (the trimmed name, falling back to the email address when the name is missing or blank), and `last_signed_in_at` is set. The first row ever created gets `role = 'owner'`; every later row gets `staff`. Sign in never changes an existing row's `role` or `is_active`, and the caller cannot pass either value in.
- **AC-4**: A signed in person sees their display name and a sign out button in the header. Sign out returns them to `/` with no staff controls showing. A signed out visitor sees no staff controls in the header and only a "Staff sign in" link in the footer.
- **AC-5**: A signed in person whose `is_active` is false sees the public board plus a notice in the staff slot that their account is switched off and a sign out button, and every write they attempt is refused by policy and surfaced as `forbidden`.
- **AC-6**: A signed out visitor can change nothing: every Server Action returns `unauthenticated` before touching the database, a direct call to the database with the anon key cannot insert or update a `staff` row, and `ensure_staff` is not executable by `anon`.
- **AC-7**: A tab left open longer than the life of a Clerk token (about a minute) still writes successfully afterwards, because each Server Action fetches a fresh token.
- **AC-8**: If Clerk reports a signed in person but the `staff` row cannot be created or read (database unreachable, migration missing, or the call takes longer than 3 seconds), the board still renders without waiting, the staff slot shows a short "Could not load your account" notice with a sign out button, and the error is logged on the server.
- **AC-9**: The thread is proven end to end: a freshly invited person signs in for the first time, their row appears, and their first booking write succeeds with `changed_by` equal to their Clerk id. This is the sign in half of feature 3's last build task.
- **AC-10**: The `/sign-in` and `/sign-up` pages render inside the app shell, match the design tokens in both light and dark themes, are keyboard usable, meet WCAG AA contrast, and are marked `noindex`.

## Decision

**Chosen option**: Option 1: A `security definer` function called on sign in with the person's own token.

Staff identity stays in Clerk (email code, password, and Google, invitation only), and a `staff` row is created or refreshed by `public.ensure_staff()` on every signed in page load, with the first row ever created becoming the owner.

**Implementation skills**: `clerk-nextjs-patterns` (`clerk/skills`, `.agents/skills/clerk-nextjs-patterns/`) · `clerk-setup` (`clerk/skills`, `.agents/skills/clerk-setup/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `zod` (`pproenca/dot-skills`, `.agents/skills/zod/`) · `tailwind-4-docs` (`lombiq/tailwind-agent-skills`, `.agents/skills/tailwind-4-docs/`)

## Rationale

The context, the options weighed, and the reasoning behind each smaller call (sign in methods, owner bootstrap, session length, where name and email come from): see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

`staff` (exists from spec 0002; this feature adds two columns and one function, no new table)

| Column              | Type                                | Change   | Note                                                                                                       |
| ------------------- | ----------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `clerk_user_id`     | `text primary key`                  | none     | the `sub` claim on the Clerk token                                                                         |
| `display_name`      | `text not null`, 1 to 80 chars      | none     | refreshed from Clerk on every sign in, email address as fallback, trimmed to 80 before the check constraint |
| `email`             | `text`                              | **new**  | Clerk's primary email, refreshed on every sign in, `check (length(email) <= 254)`, never granted to `anon` |
| `role`              | `text not null default 'staff'`     | none     | `staff` or `owner`; set once at creation by the bootstrap rule, changed only by SQL                          |
| `is_active`         | `boolean not null default true`     | none     | never touched by sign in                                                                                   |
| `created_at`        | `timestamptz not null default now()` | none    |                                                                                                            |
| `last_signed_in_at` | `timestamptz`                       | **new**  | set to `now()` on every `ensure_staff()` call                                                              |

`public.ensure_staff()` returns `(display_name text, role text, is_active boolean)`, no parameters:

- `language plpgsql`, `security definer`, `set search_path = ''`, owned by the migration role.
- Reads the token once: `v_claims := auth.jwt()`, then `v_sub := v_claims ->> 'sub'`, `v_name := left(coalesce(nullif(btrim(v_claims ->> 'name'), ''), v_claims ->> 'email'), 80)`, `v_email := nullif(btrim(v_claims ->> 'email'), '')`. Raises `insufficient_privilege` if `v_sub` is null, and raises `check_violation` with the message "the session token carries no name or email; check the Clerk session token claims" if `v_name` is null, so a forgotten dashboard step fails loudly on the first sign in.
- If a row for `v_sub` exists: `update public.staff set display_name = v_name, email = v_email, last_signed_in_at = now() where clerk_user_id = v_sub`. No lock.
- Otherwise: `perform pg_advisory_xact_lock(hashtext('staff_bootstrap'))`, then `insert ... values (v_sub, v_name, v_email, case when not exists (select 1 from public.staff) then 'owner' else 'staff' end, now()) on conflict (clerk_user_id) do update set display_name = excluded.display_name, email = excluded.email, last_signed_in_at = now()`. The lock serialises only first sign ins, so two of them cannot both see an empty table; the `on conflict` covers the same person's first two requests racing.
- `role` and `is_active` are never in an update list, by design. Returns the three columns.
- `revoke execute ... from public, anon`; `grant execute ... to authenticated`.

Relationships are unchanged from spec 0002: `staff` 1:N `reservation` (`created_by`, `changed_by`), `staff` 1:N `court` and `venue_settings` (`changed_by`).

**State transitions**:

`staff` row: absent → active `staff` (first load; the very first row instead → active `owner`) → inactive (an owner sets `is_active = false` by SQL) → active again (SQL). Role changes are SQL by an owner. Sign in moves a row from absent to active and otherwise only refreshes `display_name`, `email`, `last_signed_in_at`.

**API surface**:

| Surface                                 | Kind                                | Key inputs                                                                   | Key outputs                                                                                             | Auth                                            | Key errors                                                                                                                       |
| --------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `/sign-in/[[...sign-in]]`               | page, `<SignIn />` in `AppShell`    | email, code or password, or Google; `redirect_url`                           | a Clerk session cookie, redirect to `/`                                                                 | public; the page calls `auth()` first and `redirect('/')` for a signed in visitor | uninvited address refused by Clerk (its own message, shown by the component); the page adds the fixed line "This board is for staff. Ask Ella for an invitation if you need one." under the card, beside Clerk's message, never replacing it; Clerk unreachable → component's own error |
| `/sign-up/[[...sign-up]]`               | page, `<SignUp />` in `AppShell`    | the `__clerk_ticket` from an invitation link, then a password or code        | a Clerk session cookie, redirect to `/`                                                                 | public; only usable with a ticket in Restricted mode; same `auth()` redirect for a signed in visitor | no or expired ticket → refused by Clerk with its message; the same fixed staff only line under the card                          |
| `currentStaff()`                        | server helper, `lib/staff.ts`, `cache()` | none (reads Clerk `auth()`, then `rpc('ensure_staff')` with `abortSignal(AbortSignal.timeout(3000))`) | `{ kind: 'signed_out' }` · `{ kind: 'ok', staff: { displayName, role, isActive } }` · `{ kind: 'error' }` | signed in only; signed out short circuits       | one try and catch around everything after `auth()`: a thrown RPC error, a Postgres error result, or the 3 second abort all become `error`, logged with `console.error` |
| `ensure_staff()`                        | Postgres function, called by `rpc()` | none; reads `sub`, `name`, `email` from `auth.jwt()`                          | `display_name`, `role`, `is_active`                                                                     | `authenticated` role only, acts on `auth.jwt()->>'sub'` | `42501` for `anon` or a token with no `sub`; `23514` when the token carries neither a name nor an email                       |
| `<StaffMenu />`                         | server component in the shell's `staff` slot, wrapped in `<Suspense fallback={null}>` by the page | `currentStaff()`                       | name (opens `useClerk().openUserProfile()`) + sign out, or the inactive notice + sign out, or the error notice + sign out | renders only inside `<Show when="signed-in">`   | none, every state has a rendering; the board streams and never waits on it                                                    |
| Sign out                                | client button, `useClerk().signOut({ redirectUrl: '/' })` | none                                                    | Clerk session ended, back on `/`                                                                        | signed in                                       | Clerk unreachable → button stays, toast via the existing sonner                                                                  |
| `requireStaff()`                        | unchanged                           |                                                                              |                                                                                                         |                                                 | `unauthenticated` with no session; `42501` on a write from an inactive account maps to `forbidden` as today                     |

**Value sourcing** (every value each action produces, computes, or displays names where it comes from):

| Action           | Value produced / displayed                     | Source                                                                                                                   |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ensure_staff`   | `clerk_user_id`                                | `auth.jwt() ->> 'sub'` inside the function, never a parameter, decided in spec 0001                                       |
| `ensure_staff`   | `display_name`                                 | the `name` claim on the session token (`{{user.full_name}}`, set in Clerk's session token customisation), trimmed, falling back to the `email` claim when blank, cut to 80 |
| `ensure_staff`   | `email`                                        | the `email` claim on the session token (`{{user.primary_email_address}}`), null when blank                                |
| `ensure_staff`   | `role` on creation                             | derived: `owner` when `public.staff` is empty under the advisory lock taken only on a first sign in, else `staff`          |
| `ensure_staff`   | `is_active` on creation                        | the column default `true`                                                                                                 |
| `ensure_staff`   | `last_signed_in_at`                            | `now()` on the database clock, UTC `timestamptz`                                                                          |
| `currentStaff()` | whether someone is signed in                   | Clerk `auth().isAuthenticated`                                                                                            |
| `currentStaff()` | the Supabase client that carries the token     | `staffSupabase()` from `lib/supabase/staff.ts`, decided in spec 0001                                                      |
| `<StaffMenu />`  | the name shown in the header                   | `display_name` returned by `ensure_staff`, not Clerk directly, so the header shows what `changed_by` will resolve to      |
| `<StaffMenu />`  | which of the three states to render            | `currentStaff().kind`, then `staff.isActive`                                                                              |
| `<StaffMenu />`  | the "manage account" action                    | `useClerk().openUserProfile()`, Clerk's modal, no URL                                                                     |
| `<StaffMenu />`  | how long to wait before showing the error state | the 3 second `AbortSignal.timeout` inside `currentStaff()`, fixed                                                        |
| Sign out         | where to land afterwards                       | `/`, fixed                                                                                                                |
| `/sign-in`       | where to land after success                    | `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/`, or the `redirect_url` param Clerk carries                             |
| `/sign-in`, `/sign-up` | whether to redirect a visitor away         | Clerk `auth().isAuthenticated` in the page, then `redirect('/')`                                                          |
| `/sign-in`, `/sign-up` | the staff only line                       | a fixed string in the page: "This board is for staff. Ask Ella for an invitation if you need one."                        |
| `/sign-up`       | the invitation                                 | the `__clerk_ticket` query param Clerk puts on the invitation link, whose target is set to `<site>/sign-up` in the dashboard |
| footer link      | whether to show "Staff sign in"                | `<Show when="signed-out">` and `clerkConfigured`                                                                          |
| any later write  | `changed_by` (AC-9)                            | `auth.jwt() ->> 'sub'` per spec 0002, which now has a `staff` row to reference                                            |

**Key invariants**:

1. A `staff` row's `clerk_user_id` always equals the `sub` claim of the token that created it. Enforced inside `ensure_staff`; there is no other insert path.
2. Exactly one row is created with `role = 'owner'` by the bootstrap rule. Enforced by the advisory lock, taken only when the caller has no row yet, plus the "table is empty" test in the same transaction. The rule assumes the table is empty when Ella first signs in; build plan step 2 checks that on the linked project.
3. Sign in never changes `role` or `is_active`. Enforced by the function's update lists; the function has no parameters at all, and name and email come from the signed token.
3a. A page render never waits on `ensure_staff`. The staff slot streams inside `<Suspense>` and the call aborts after 3 seconds into the error state.
4. `anon` cannot execute `ensure_staff` and has no grant of any kind on `staff`. Enforced by grants.
5. The `staff` row exists before any write from that person, because `currentStaff()` runs on every signed in page render and every write follows a page render.
6. `display_name` is never empty and never longer than 80 characters: the function trims and truncates, and the existing check constraint is the backstop.
7. Every timestamp is `timestamptz` in UTC; the header never shows one, so no local conversion is needed in this feature.

**Security model**:

- Anonymous (the public board): no access to `staff` at all, no execute on `ensure_staff`. Unchanged from spec 0002.
- Signed in, any role: may execute `ensure_staff`, which only touches their own row. Active staff may read the staff list (existing select policy). An inactive person can execute `ensure_staff` (it returns their own row, which is how the app learns they are inactive) and can read and write nothing else, because every policy calls `private.is_active_staff()`.
- Owner: no extra rights in this feature. Role and `is_active` changes are SQL through the Supabase SQL editor, outside the app, until a management screen exists.
- Clerk: Restricted sign up mode, so the only way to an account is an invitation from the dashboard. Clerk rate limits code and password attempts itself. A banned Clerk user cannot obtain a token at all.
- `proxy.ts` protects no route in this feature. Enforcement stays where spec 0001 put it: `requireStaff()` for a typed answer, row level security for the truth.
- Personal data: `email` is a second copy of what Clerk holds, readable by active staff only. It is ordinary personal data with no special regime; scope feature 12 owns telling people what is kept.
- Both auth pages carry `robots: { index: false, follow: false }`.

**Configuration required**:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`: already named in spec 0001, now required for the feature to do anything.
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` and `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`: tell Clerk's components and redirects where the in app pages are.
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/` and `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/`: where a person lands when no `redirect_url` was carried.
- Clerk dashboard prerequisites (only you can do these): sign up mode set to Restricted; email code, password, and Google enabled as sign in methods; session inactivity timeout and maximum lifetime both 30 days; the Supabase integration enabled (it adds the `role: authenticated` claim the policies need); the session token customised with `{"name": "{{user.full_name}}", "email": "{{user.primary_email_address}}"}` so `ensure_staff` can read them; the invitation redirect URL set to `<site>/sign-up`.
- Supabase dashboard prerequisite: Clerk enabled as a third party auth provider with the Clerk Frontend API domain, matching `supabase/config.toml`.
- No webhook signing secret. Spec 0001 expected one; this decision removes the need.

**Critical test scenarios** (each maps to an acceptance criterion in `## Requirements`):

- Happy path: Ella is invited, opens the link, creates her account at `/sign-up`, lands on `/` with her name in the header, and her `staff` row exists with `role = 'owner'`; a second invited person does the same and gets `staff`, verifies **AC-1**, **AC-3**, **AC-4**.
- Happy path: she closes the browser, reopens it a day later, and is still signed in, verifies **AC-2**.
- Happy path: the newly signed in staff member books a court and the reservation's `changed_by` is their Clerk id, verifies **AC-9**.
- Failure case: a person whose `is_active` is false loads the board, sees the switched off notice, and a booking attempt returns `forbidden`, verifies **AC-5**.
- Failure case: `ensure_staff` throws (simulated by revoking execute in a test database or pointing at a bad URL); the board renders and the notice shows, verifies **AC-8**.
- Failure case: the RPC is made to hang (a mocked client that never resolves); the board's HTML arrives at once and the notice appears after the 3 second abort, verifies **AC-8**.
- Failure case: a token with no `name` and no `email` claim calls `ensure_staff`; it raises with the message naming the Clerk session token setting, and the shell shows the error notice, verifies **AC-3**, **AC-8**.
- Failure case: two first sign ins run concurrently in a test; exactly one row is `owner`, verifies **AC-3**.
- Auth and permission: a signed out visitor calls a write action and receives `unauthenticated`; a direct anon key `rpc('ensure_staff')` and a direct anon insert into `staff` are both refused, verifies **AC-6**.
- Long tab: a signed in tab is left idle past the Clerk token life, then a Server Action is invoked and succeeds, verifies **AC-7**.
- Uninvited: an address not invited tries `/sign-up` and `/sign-in`; Clerk refuses and the staff only line is visible, verifies **AC-1**.
- Presentation: the two pages pass the contrast audit in both themes, are navigable by keyboard, and carry `noindex`, verifies **AC-10**.

## Build plan

Tracer Bullet: the thinnest thread is one real person signing in, getting a row, and signing out. That goes first and is proven live before anything is made nice. Everything after thickens that thread.

1. [ ] Dashboard prerequisites, yours to do before the code can be exercised: Clerk Restricted sign up, the three sign in methods, both session settings at 30 days, the Supabase integration switched on, the session token customised with the `name` and `email` claims, the invitation redirect URL, and Clerk enabled as a third party provider in the Supabase dashboard; then add the six Clerk env values to `.env.local`, satisfies **AC-1**, **AC-2**, **AC-3**.
2. [x] One migration: `alter table public.staff add column email text check (length(email) <= 254), add column last_signed_in_at timestamptz`, the parameterless `ensure_staff` function (claims read from `auth.jwt()`, plain update when the row exists, advisory lock plus owner bootstrap only on a first sign in), the execute grants and revokes, then `npx supabase db push` and `npx supabase db advisors`, regenerate `database.types.ts`, and confirm `select count(*) from public.staff` is `0` on the linked project before anyone signs in, satisfies **AC-3**, **AC-6**.
3. [x] The thin thread: a bare `/sign-in/[[...sign-in]]` page with `<SignIn />`, `currentStaff()` in `lib/staff.ts` (Clerk `auth()`, `rpc('ensure_staff')` with the 3 second abort, `cache()`, one try and catch into a typed three way result with a `console.error` on failure), and a first `<StaffMenu />` showing the name and a sign out button, placed in the home page's `staff` slot inside `<Suspense fallback={null}>`; prove it live by signing in as the first user and reading the `owner` row, satisfies **AC-3**, **AC-4**, **AC-8**.
4. [ ] The invitation path: `/sign-up/[[...sign-up]]` with `<SignUp />`, the invitation redirect URL pointing at it, and a second invited account proven to land as `staff`, satisfies **AC-1**, **AC-3**.
5. [x] The other two states of `<StaffMenu />`: the switched off notice for `isActive = false` and the "Could not load your account" notice for `error`, each with the sign out button, and the name opening `useClerk().openUserProfile()`; prove the inactive write refusal maps to `forbidden` and that a hung RPC still returns the board at once, satisfies **AC-4**, **AC-5**, **AC-8**.
6. [x] The signed out surface: the "Staff sign in" footer link gated on `<Show when="signed-out">` and `clerkConfigured`, `auth()` plus `redirect('/')` at the top of both auth pages for a signed in visitor, and the fixed staff only line under both Clerk cards, satisfies **AC-1**, **AC-4**.
7. [x] Presentation: `@clerk/ui` with the shadcn theme mapped to the tokens, both pages inside `AppShell` with no toolbar, `noindex` metadata, the contrast audit extended to the Clerk card in both themes, keyboard pass, satisfies **AC-10**.
8. [ ] Prove the thread the other features wait on: a signed in staff member's first booking write succeeds with `changed_by` set (this is feature 3's last box), and a tab idled past the token life still writes, satisfies **AC-7**, **AC-9**.
9. [x] Tests: unit tests for `currentStaff()` (three results, the abort, `cache()` behaviour) and `<StaffMenu />` (three renders), a database test for `ensure_staff` (owner bootstrap under two concurrent first sign ins, no lock and no role or active change on a refresh, a token with no name or email refused with the named message, anon refused), and the existing `describeDatabaseError` mapping for `42501`, satisfies **AC-3**, **AC-5**, **AC-6**, **AC-8**.

## Consequences

**Positive**:

- One trust boundary. The same signed Clerk token creates the row, carries the write, and is read by every policy. No key in app code can act as anyone else.
- Feature 3 can finish: its last build task was waiting on a real signed in person with a real row.
- Self healing provisioning. A name changed in Clerk or a row missing for any reason is fixed on the next page load, with no dashboard step to forget.
- No webhook endpoint, no signing secret, no retry story, no public route to rate limit.
- Staff see the same name on the header that appears on their bookings, so "who did this" is never ambiguous.

**Negative / tradeoffs**:

- A write on every signed in page render. It is one small update for a handful of people, with no lock after the first sign in and no call to Clerk's API, but it means a read only page is not read only for staff, and the database must be reachable to show a name (the board itself still renders when it is not).
- Two more Clerk dashboard settings that a new environment must not forget: the Supabase integration and the session token claims. The failure is loud (a named error on the first sign in), not silent.
- No route protection. Landing on `/` means nothing in `proxy.ts` guards a path. Safe today because the policies are the enforcement point, but feature 6 has to decide where customer names are shown, and if that is a new path it needs `auth.protect()` then.
- Role and deactivation are SQL. Until a staff management screen exists, Ella changes a role or switches someone off in the Supabase SQL editor, which is a real gap for a non technical owner and is the first follow up to consider.
- `email` is a second copy of personal data that Clerk already holds, kept current only when the person signs in. A leaver's email stays in the row until someone clears it.
- Owner by arrival order. If someone other than Ella signs in first, the fix is one SQL statement, but it is a surprise worth a line in the setup notes.
- Google in production is not finished by this feature; it works in development on Clerk's shared credentials and needs your own OAuth client before launch.
- A 30 day session means a lost phone stays signed in for up to a month unless the account is banned in Clerk.

**Neutral**:

- Spec 0001's mention of a Clerk webhook and a webhook signing secret is superseded by this decision; its follow up line about feature 5 is now answered.
- `@clerk/ui` is a new dependency, a Clerk sub package rather than a new tool, brought in only for the shadcn theme.
- `requireStaff()` does not change. A refused write from an inactive account keeps arriving as `42501` and is mapped to `forbidden` as today.
- The staff realtime token refresh (spec 0001 rule 12) is still owed, now explicitly to feature 6.

## Follow-up

- [ ] Create your own Google Cloud OAuth client and enter it in Clerk's production instance before launch; until then Google sign in works only in development.
- [ ] Feature 6 must decide where the staff grid with customer names lives. If it gets its own path, add `createRouteMatcher` and `auth.protect()` for it in `proxy.ts` at that point, and build the staff realtime listener that calls `realtime.setAuth()` on Clerk's token refresh (spec 0001 rule 12, deferred from feature 1).
- [ ] A staff management screen for the owner (role changes, switching a leaver off, clearing a leaver's email) so nothing needs the SQL editor. Not in scope now; likely wanted within the first weeks of real use. Candidate for scope feature 8 or a new row.
- [ ] Spec 0001's follow up about a Clerk webhook and `CLERK_WEBHOOK_SIGNING_SECRET` is answered by this spec; worth a one line note on 0001 when the scope is next reworked.
- [ ] Write a short setup note (in `docs/` or the README) saying the first person to sign in becomes the owner, that the `staff` table must be empty before that first sign in, and listing the Clerk dashboard settings from the configuration section, so a new environment is set up the same way.
- [ ] Feature 3's remaining build task and feature 1's deferred "two tab version conflict as seen by a person" check can both run once this feature is built; note them when closing this feature.
