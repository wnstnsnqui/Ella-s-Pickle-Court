# 0012. Admin and superadmin roles, with a user management screen

**Date**: 2026-09-17
**Status**: In Progress

_See [rationale.md](rationale.md) for the Context, the options considered and why Option 1 was chosen. See [verify.md](verify.md) for the acceptance-criteria verify steps._

**Revised 2026-09-18**: `owner` now carries the same power as `superadmin`, including reaching `/staff/admin/users` and managing everyone's role, not just standing equal to `admin` on the older, owner gated surfaces. The engineer's own call, made directly rather than through `/architect`, on the reasoning that the person holding `owner` (meant to be exactly one person, Ella) should not need a second, separate role just to manage access. Everywhere below that still reads "superadmin only" for the management screen means "owner or superadmin" post revision; the acceptance criteria are updated in place rather than superseded, since the shape of the feature does not change, only who may use it.

## Summary

Two new roles join `staff` and `owner`: `admin`, who can do everything an owner can, and `superadmin` (Winston), who can do everything an owner or admin can. `owner` and `superadmin` both reach a new screen at `/staff/admin/users`, the one capability `admin` does not get: managing everyone's role and active status. That screen lists every staff account and lets an owner or superadmin change a person's role or switch them active or inactive, with a confirm step and a written record of who changed what. This closes the gap the original staff sign in feature (spec 0004) left behind: role changes have needed a database editor until now.

## Requirements

**User stories**:

- As Winston (superadmin), I want to see every staff account, their role and whether they are active, in one screen, so that I do not need the Supabase dashboard to know who has access to what.
- As Winston, I want to change someone's role or switch them off from that screen, so that promoting a trusted staff member to admin, or removing a leaver's access, takes a few taps.
- As Winston, I want to hand the owner role to someone else without ending up with two owners, so that the single owner rule from spec 0004 keeps holding.
- As Ella (owner) or an admin, I want my existing owner powers (settings, reports, courts, hours) to keep working exactly as before, so that this change does not take anything away from me.
- As anyone else, I want to be unable to touch anyone's role, so that only the person Winston trusts with it can grant access.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: `/staff/admin/users` renders only for a signed in, active `owner` or `superadmin`. A signed in person of any other role, active or not, is redirected to `/staff` before any data loads, the same courtesy redirect pattern as `/staff/settings`. The page is marked `noindex`.
- **AC-2**: The page reads every staff row (active and inactive) through one new function, `getAllStaff()`, on `staffSupabase()`: display name, email, role, active flag, last signed in at, and version. Rows are ordered most privileged first, `owner`, then `superadmin`, then `admin`, then `staff`, and alphabetically by name within a role. While it streams, a skeleton shows; a failed read shows an error notice with a `router.refresh()` retry, matching the `/staff/settings` pattern.
- **AC-3**: Each row shows its role and active state as plain text (`Admin · Active`, for example). Every row but the signed in owner's or superadmin's own also carries an edit button opening `UserSheet`, a side sheet filled with that person's name, email and last signed in time (the same side sheet pattern `/staff/settings` already uses to edit a court), rather than a directly clickable dropdown or switch, since opening the sheet is itself the deliberate act (revised from an additional confirm step, see AC-4). The signed in owner's or superadmin's own row carries no edit button at all, so nobody can change their own role or active flag from this screen. `owner` always stays selectable in the sheet, because picking it for someone new is how the role moves (AC-9 demotes whoever held it before, so the table never actually gains a second one). The `superadmin` option is disabled in the sheet on every row not already `superadmin` once two rows already hold it, read from the same `getAllStaff()` result already on the page, no extra query.
- **AC-4**: Picking a new role or active flag in `UserSheet` and choosing Save calls a new Server Action, `updateStaffRole`, directly, with the target's Clerk id, the new role, the new active flag, and the version the page last read. No separate confirm step: revised from an original two step flow (`UserSheet` then `ConfirmDialog`) once the sheet itself, opened deliberately from a row's edit button, was judged deliberate enough on its own. `ConfirmDialog` stays in the codebase (`staff-board.tsx` still uses it) but this feature no longer does.
- **AC-5**: `updateStaffRole` calls `requireStaff()`, validates its input with Zod, then calls a new Postgres function, `public.update_staff_role(p_clerk_user_id, p_role, p_is_active, p_version)`, through `staffSupabase()`.
- **AC-6**: `update_staff_role()` only runs for an `owner` or `superadmin`: it is `security definer`, checks the caller's own row has `role in ('owner', 'superadmin')` and `is_active`, and raises `42501` otherwise, mapped by `describeDatabaseError` to `forbidden`. Its `execute` grant is `authenticated` only, revoked from `anon`.
- **AC-7**: `update_staff_role()` refuses a call where the target Clerk id equals the caller's own, raising `42501` mapped to `forbidden`, regardless of whether the calling client is the app's own UI (AC-3 already disables this case, this is the enforcement point behind it). This holds for an owner transferring `owner` away from themselves too: that is a different row (the demoted previous owner) being updated as a side effect, not the caller's own row being the direct target, so it is allowed; only a direct self target is refused.
- **AC-8**: `update_staff_role()` updates the target row only when its `version` matches `p_version`; a mismatch touches zero rows and raises `P0002` (the same code `reorder_courts` already uses for this), which `describeDatabaseError` maps to `{ kind: "conflict", reason: "version_stale" }`. On that result the page refetches `getAllStaff()`, replaces its rows, and a toast says the account changed while the page was open.
- **AC-9**: When `p_role` is `'owner'` and a different row currently holds `role = 'owner'`, `update_staff_role()` demotes that row to `admin`, bumping its version, in the same transaction as it sets the target to `owner`. Both writes commit together or not at all. A partial unique index on `staff (role) where role = 'owner'` makes a second simultaneous owner impossible even under two concurrent calls: the losing transaction's insert-equivalent update fails the constraint and the whole call rolls back, surfacing as a database error the Server Action reports as `failed` (a rare race, not a named `ActionError`, so the person just retries).
- **AC-10**: Every update `update_staff_role()` makes to a `staff` row (the target, and the demoted previous owner when AC-9 applies) inserts one matching row into a new `staff_audit` table, written explicitly inside the function itself (not a trigger, so it never fires on `ensure_staff()`'s own per-page-load refresh). Each row carries the operation, the full old and new row as JSON, `changed_by` (the calling owner's or superadmin's Clerk id) and `changed_at`. `staff_audit` carries the same "active staff may read the audit trail" policy as `reservation_audit`.
- **AC-11**: `anon` has no path to any of this: `staff` carries no `UPDATE` grant to `anon` or `authenticated` at all (the table owner writes it, and `update_staff_role()` runs as that owner via `security definer`), and `execute` on `update_staff_role()` is `authenticated` only. A signed out visitor or a plain `staff`/`admin` account calling the RPC directly is refused by the function's own `owner`/`superadmin` check (AC-6), not by a row level policy.
- **AC-12**: Every existing owner gated surface, `/staff/settings`, `/staff/reports`, the court and venue settings write policies, and the `court_usage` report function, is equally reachable by `owner`, `admin` and `superadmin`, because the shared `private.is_owner()` helper is widened to check `role in ('owner', 'admin', 'superadmin')` rather than duplicated. The staff menu's Reports and Settings links render for all three of those roles; the Users link renders for `owner` and `superadmin`, the one place `admin` is not equal.
- **AC-13**: The very first `superadmin` is created by a one time SQL statement Winston runs by hand against the linked project after this migration ships, promoting his own row from `owner` to `superadmin`. `ensure_staff()`'s bootstrap rule (the first person ever to sign in becomes `owner`) is unchanged. Since the revision, this step is optional rather than required for role management to work at all: whoever holds `owner` can already reach `/staff/admin/users` without it; `superadmin` is for a second person (up to two) who should have the same power without being the one `owner`.
- **AC-14**: A successful `updateStaffRole` call fires a new `staff_role_changed` analytics event through `captureStaffEvent()`, never awaited, only after the write succeeds, per the project's analytics rule; the event is added to the `.strict()` allow list in `lib/analytics/properties.ts` before this ships.

## Decision

**Chosen option**: Option 1: Widen the existing role column and its helper function.

`staff.role` gains `admin` and `superadmin` alongside `staff` and `owner`. `private.is_owner()` is widened in place so every existing owner gated policy treats `owner`, `admin` and `superadmin` alike, with no changes to the policies themselves. A new Postgres function, `update_staff_role()`, is the only way to change someone's role or active flag, restricted to `owner` or `superadmin` (revised from `superadmin` only), blocking a caller from touching their own row, and demoting a previous `owner` in the same transaction as handing the role to someone new. A new `/staff/admin/users` page is the one place this function is called from.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `zod` (`pproenca/dot-skills`, `.agents/skills/zod/`) · `tailwind-4-docs` (`lombiq/tailwind-agent-skills`, `.agents/skills/tailwind-4-docs/`)

## Feature design

**Data model sketch**:

`staff` (exists from spec 0002 and 0004; this feature widens one constraint and adds one column, no new table for staff data)

| Column       | Type                                          | Change  | Note                                                                             |
| ------------ | ---------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `role`       | `text not null default 'staff'`               | widened | check becomes `role in ('staff', 'owner', 'admin', 'superadmin')`                  |
| `version`    | `integer not null default 1`                  | **new** | bumped on every role or active change through `update_staff_role()`               |
| (all others) | unchanged from spec 0004                       | none    |                                                                                     |

`staff_audit` (new table, mirrors `reservation_audit`'s shape and hardening)

| Column          | Type                                      | Note                                                    |
| --------------- | ------------------------------------------ | -------------------------------------------------------- |
| `id`            | `bigint generated always as identity pk`  |                                                            |
| `staff_id`      | `text not null`                           | the `clerk_user_id` of the row changed, no FK (outlives it) |
| `op`            | `text not null check (op in ('update'))`  | only updates go through this path                          |
| `old_row`       | `jsonb`                                   |                                                            |
| `new_row`       | `jsonb`                                   |                                                            |
| `changed_by`    | `text`                                    | the calling superadmin's Clerk id, from `auth.jwt()`        |
| `changed_at`    | `timestamptz not null default now()`      |                                                            |

`enable row level security`; `create index staff_audit_staff_idx on public.staff_audit (staff_id, changed_at desc)`, matching `reservation_audit_reservation_idx`; `grant select on public.staff_audit to authenticated`, no insert/update/delete grant to anyone (only `update_staff_role()`, running as the table owner, writes it); policy `"active staff may read the staff audit trail"` using `private.is_active_staff()`, matching `reservation_audit`'s existing policy.

One new index on `staff` itself: `create unique index staff_single_owner_idx on public.staff (role) where role = 'owner'`, the real, database level half of the "at most one owner" rule (AC-9).

`public.update_staff_role(p_clerk_user_id text, p_role text, p_is_active boolean, p_version integer)` returns the updated `staff` row:

- `language plpgsql`, `security definer`, `set search_path = ''`.
- Raises `42501` unless the caller's own `staff` row has `role in ('owner', 'superadmin') and is_active` (the check is inlined here, not a separate helper; revised from `superadmin` only).
- Raises `42501` if `p_clerk_user_id = (select auth.jwt() ->> 'sub')` (AC-7, the self lockout guard).
- If `p_role = 'owner'` and a row other than the target currently holds it: `update public.staff set role = 'admin', version = version + 1 where role = 'owner' and clerk_user_id <> p_clerk_user_id returning *`, then insert its old and new row into `staff_audit`. The `staff_single_owner_idx` above makes a concurrent double promotion fail the transaction outright rather than silently succeed.
- `update public.staff set role = p_role, is_active = p_is_active, version = version + 1 where clerk_user_id = p_clerk_user_id and version = p_version returning *`, then insert its old and new row into `staff_audit`. Zero rows raises `stale_version` with `errcode = 'P0002'`, matching `reorder_courts`'s existing convention (AC-8).
- No `staff_audit` trigger: both inserts happen explicitly inside this function, so `ensure_staff()`'s own per-page-load refresh of `display_name`/`email`/`last_signed_in_at` never touches the audit table.
- `revoke execute ... from public, anon`; `grant execute ... to authenticated`. `staff` itself carries no `UPDATE` grant to `anon` or `authenticated`; this function, running as the table owner, is the only writer, so no RLS update policy on `staff` is needed or added.

Relationships are unchanged from spec 0002 and 0004.

**State transitions**:

`staff.role`: any of `staff` / `admin` / `superadmin` may move to any other of those three, one way at a time, only through `update_staff_role()`. `owner` moves to a new holder only by that new holder being set to `owner` (which demotes the previous holder to `admin` in the same call); nothing here ever assigns `owner` to a second row at once. `is_active` toggles independently of role, through the same function.

**API surface**:

| Surface                     | Kind                                | Key inputs                                                              | Key outputs                                                     | Auth                                             | Key errors                                                                 |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/staff/admin/users`         | page, server component               | none (reads `currentStaff()` then `getAllStaff()`)                       | the staff table with role and active controls                       | signed in `owner` or `superadmin` only; else redirect `/staff` | none rendered client side; a failed read shows the error notice                |
| `getAllStaff()`              | server read, `lib/staff.ts`          | none                                                                     | every `staff` row: name, email, role, active, last signed in, version | `staffSupabase()`, relies on the existing "active staff may read the staff list" select policy | a thrown error surfaces as the page's error notice                            |
| `updateStaffRole`            | Server Action                        | `clerkUserId`, `role`, `isActive`, `version`                              | `{ ok: true, staff }` · `forbidden` · `conflict` (reason `version_stale`) | `requireStaff()` then the RPC's own `owner`/`superadmin` check | `forbidden` (not owner or superadmin, or targeting own row) · `conflict`/`version_stale` (stale write, mapped from `P0002`) |
| `update_staff_role()`        | Postgres function, called by `rpc()` | `p_clerk_user_id`, `p_role`, `p_is_active`, `p_version`                   | the updated `staff` row                                             | `authenticated` only, checks caller's own row is `owner` or `superadmin` | `42501` (not owner or superadmin, or self) · `P0002` (stale version, `describeDatabaseError` maps it to `version_stale`)                     |
| `<StaffMenu />`              | existing server component, widened   | `currentStaff()`                                                        | adds a Users link for `owner` and `superadmin`; Reports/Settings now also render for `admin` and `superadmin` | unchanged                                          | none                                                                            |

**Value sourcing** (every value each action produces, computes, or displays names where it comes from):

| Action                | Value produced / displayed                          | Source                                                                                     |
| ---------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `getAllStaff()`        | every field shown in the table                          | the `staff` table, read under the existing "active staff may read the staff list" policy         |
| the role dropdown      | which options are disabled for a given row              | the `owner` and `superadmin` counts computed client side from the same `getAllStaff()` result, no extra query |
| `updateStaffRole`      | whether the caller may act at all                       | `requireStaff()` (signed in) then `update_staff_role()`'s own `owner`/`superadmin` check          |
| `update_staff_role()`  | whether the target is the caller                        | `p_clerk_user_id` compared to `auth.jwt() ->> 'sub'` inside the function                          |
| `update_staff_role()`  | the previous owner's demotion, when one exists           | derived: any row with `role = 'owner'` other than the target, fixed to `admin`                    |
| `update_staff_role()`  | `version` after the write                                | `version + 1` inside the function, never the client's own arithmetic                             |
| `staff_audit`          | `changed_by`                                            | `auth.jwt() ->> 'sub'` read once inside `update_staff_role()`, the calling superadmin's Clerk id   |
| `staff_audit`          | `old_row` / `new_row`                                   | `to_jsonb()` of the row before and after each update, inserted explicitly by `update_staff_role()`, same JSON shape as `reservation_audit` but no trigger |
| `updateStaffRole`      | the `staff_role_changed` analytics event's properties    | the target's Clerk id, the new role, the new active flag, all already Server Action inputs         |
| any redirect off `/staff/admin/users` | where anyone but owner or superadmin lands | fixed, `/staff`, same as `/staff/settings` and `/staff/reports`                                   |
| `lib/staff.ts`         | `StaffRole` (the TypeScript union `currentStaff()` returns) | widened from `"staff" \| "owner"` to all four database values; the coercion that currently collapses anything but `"owner"` to `"staff"` is replaced with a pass through of the `role` column |

**Key invariants**:

1. Nobody, owner or superadmin included, can change their own role or active flag through this feature. Enforced twice: the UI shows no controls on that row (AC-3), and `update_staff_role()` refuses a direct self target regardless (AC-7). An owner may still transfer `owner` away from themselves; that demotes their own row as a side effect of the transfer, not a self target (AC-7's note).
2. Every role or active change is conditional on `version`; a stale write updates zero rows and is refused. Enforced inside `update_staff_role()`.
3. At most one `staff` row ever holds `role = 'owner'`. Enforced by `staff_single_owner_idx`, a real database constraint, not just by `update_staff_role()`'s demote-then-promote logic; a concurrent double promotion fails the transaction instead of succeeding.
4. `anon` and plain `authenticated` callers have no way to update `staff` directly: the table carries no `UPDATE` grant to either, so `update_staff_role()` (running as the table owner via `security definer`) is the only writer, gated by its own `owner`/`superadmin` check and its `execute` grant to `authenticated` only.
5. Every successful role or active change is recorded in `staff_audit`, readable by any active staff member, matching the existing audit trail's access. Written explicitly inside `update_staff_role()`, never by a trigger, so `ensure_staff()`'s routine per-page-load refresh never appears in it.
6. The "at most two superadmin" rule is enforced by this feature's own screen only, not by a database constraint (a deliberate choice, see `rationale.md`, unlike the owner cap above which is DB enforced); a write from outside this screen is not bound by it. `owner` needs no equivalent cap here: `staff_single_owner_idx` already holds it to exactly one.

**Security model**:

- Anonymous: unchanged, no access to `staff` of any kind.
- `staff`: unchanged from spec 0004, no write access to anyone's role.
- `admin`: equal standing to `owner` everywhere an owner gated policy already exists (courts, venue settings, `court_usage`), because `private.is_owner()` now passes for all three of `owner`, `admin`, `superadmin`. May not read or write through `update_staff_role()` or reach `/staff/admin/users`; this is the one place `admin` stands below `owner` and `superadmin`.
- `owner`, `superadmin`: everything `admin` can do, plus the ability to change anyone else's role or active flag, gated entirely by `update_staff_role()`'s own check (there is no `staff` update policy; the table has no `UPDATE` grant to `authenticated` at all), with no ability to touch its own row directly. `owner` is capped at exactly one row by `staff_single_owner_idx`; `superadmin` is capped at two, in the screen only, not the database.
- Role and active changes are the only new personal data write in this feature; `staff_audit` inherits the same "active staff may read" policy as `reservation_audit`, so this is not a new privacy surface beyond what spec 0004 already established for `staff.email`.
- `getAllStaff()`'s read is not narrowed by row level security to `owner` or `superadmin`: the existing "active staff may read the staff list" policy already lets any active `staff` account read every row (including `email` and inactive rows), a spec 0004 decision this feature does not change. `/staff/admin/users` restricting itself to `owner` and `superadmin` is therefore an application level gate on top of an already broad read, not a new database restriction; nothing here narrows that existing policy.

## Build plan

Tracer Bullet: the thinnest real thread is one superadmin loading the page and seeing every staff account. That goes first; the write path, the owner transfer, and the audit trail thicken it.

1. [x] One migration: widen `staff_role_check` to include `admin` and `superadmin`, add `staff.version`, add `staff_single_owner_idx`, widen `private.is_owner()`'s body to `role in ('owner', 'admin', 'superadmin')`, add `public.update_staff_role()` (its `superadmin` check inlined, no separate helper, no `staff` update policy or grant, both audit inserts written explicitly inside it) with its `execute` grants, add `staff_audit` with its select policy, its select grant, and its index; then `npx supabase db push` and `npx supabase db advisors --linked`, and regenerate `database.types.ts`, satisfies **AC-6**, **AC-7**, **AC-8**, **AC-9**, **AC-10**, **AC-11**, **AC-12**.
2. [x] Widen the TypeScript side of the existing role model before building anything new: `StaffRole` in `lib/staff.ts` becomes all four values, and `currentStaff()`'s `data.role === "owner" ? "owner" : "staff"` coercion becomes a plain pass through of the column, so `admin` and `superadmin` stop silently reading as `staff`; also widen the existing `role === "owner"` checks in `staff-menu.tsx` and the `/staff/settings` and `/staff/reports` page guards to `role === "owner" || role === "admin" || role === "superadmin"`, satisfies **AC-12**. (Also widened the same check in `staff-board.tsx`, the ended-slot editing gate, not named in this plan but the same owner-gated surface AC-12 covers; consolidated all six call sites into one `isOwnerLevel()` helper in `lib/staff.ts` rather than repeating the three way check.)
3. [x] The thin thread: `getAllStaff()` in `lib/staff.ts`, the `/staff/admin/users` page reading it with its redirect for non superadmin, a skeleton and an error notice matching `/staff/settings`, a bare table with no editing yet, and the Users link in `staff-menu.tsx` gated on `role === "superadmin"`; prove live as the freshly promoted superadmin, satisfies **AC-1**, **AC-2**.
4. [x] The write path: add shadcn's `Switch` component (not yet in the project), `updateStaffRole` Server Action with its Zod schema and its `captureStaffEvent("staff_role_changed", …)` call (after a new `.strict()` schema is added to `lib/analytics/properties.ts`), the role `Select` and active `Switch` per row (`superadmin` disabled once two rows hold it, no controls on the caller's own row), `ConfirmDialog` naming the change (including the "will become admin" line when an owner transfer is happening), toast on success, and the version conflict refetch handling, satisfies **AC-3**, **AC-4**, **AC-5**, **AC-14**.
5. [x] Prove the owner transfer and the audit trail live: promote a second test account to `admin`, transfer `owner` to a different row and confirm the previous owner becomes `admin` in the same write, and confirm two matching rows land in `staff_audit` (the demotion and the promotion) with `changed_by` set, satisfies **AC-9**, **AC-10**. (Proven against the real linked database through `supabase/tests/update_staff_role.test.ts`, run with `npm run test:db`, rather than by hand through the built screen: no browser tool is available in this session, so the mechanism `/staff/admin/users` calls was verified directly instead. `/check verify` or a manual pass is the way to confirm the screen itself renders and behaves as built.)
6. Winston runs the one time SQL promoting his own row from `owner` to `superadmin` on the linked project (documented in `## Follow-up`), satisfies **AC-13**. Not done here: it is explicitly Winston's own step, and after the revision below it is optional rather than required.
7. [x] Tests: database tests for `update_staff_role()` (self lockout refused, `P0002` on a stale version, non superadmin refused with `42501`, an owner transfer demoting the previous holder in one transaction, two audit rows inserted on a transfer, the partial unique index refusing a second `owner` row), and unit tests for the dropdown's `superadmin` cap logic and for `currentStaff()`'s widened role mapping, satisfies **AC-3**, **AC-6**, **AC-7**, **AC-8**, **AC-9**, **AC-10**, **AC-11**, **AC-12**. (The spec's own concurrent-double-transfer case is covered structurally, by proving the unique index refuses a second `owner` row, rather than with two genuinely concurrent connections, which this sequential SQL-batch test harness cannot drive.)
8. [x] Revision, owner parity: widen `update_staff_role()`'s caller check from `role = 'superadmin'` to `role in ('owner', 'superadmin')`; widen the `/staff/admin/users` page guard and the staff menu's Users link the same way (a new `canManageStaffRoles()` helper alongside `isOwnerLevel()` in `lib/schedule/constants.ts`); update the docs and comments that said "superadmin only"; add a database test proving an owner caller can now change another account's role, and flip the two staff menu tests that assumed owner was excluded, satisfies the revised **AC-1**, **AC-3**, **AC-6**, **AC-11**, **AC-12**.
9. [x] Revision, list order: `getAllStaff()` sorts most privileged first, `owner`, `superadmin`, `admin`, `staff`, alphabetically by name within a role (`STAFF_ROLE_DISPLAY_ORDER` in `lib/schedule/constants.ts`), satisfies the revised **AC-2**.
10. [x] Revision, deliberate controls, first pass: the inline role `Select` and active `Switch` (directly clickable, too easy to change by accident) replaced with a three dot menu per row.
11. [x] Revision, deliberate controls, second pass: the three dot menu replaced with `UserSheet`, a side sheet matching `CourtSheet`'s pattern exactly, filled with the account's name, email and last signed in time, with the role and active flag picked inside it. The row shows role and status as plain text with an edit button (`Pencil`) otherwise. The pure `superadminOptionDisabled`/`roleLabel` helpers moved out of `UsersPanel` into `components/staff/roles.ts` so `UserSheet` can use them without an import cycle. Satisfies the revised **AC-3**.
12. [x] Revision, drop the confirm step: `ConfirmDialog` removed from this feature (it stays in `staff-board.tsx` for its own use); `UserSheet`'s Save button, labelled `Continue` before this revision, now calls `updateStaffRole` directly. The "will become admin at the same time" note the old confirm dialog showed on an owner transfer is gone with it, noted in `## Follow-up`. The sheet also gained an `Email` label above the address, matching `Role`'s, its title became `Edit <name>`, and the active field's helper text now says "Deactivate" rather than "Switched off". Satisfies the revised **AC-4**.
13. [x] Revision, sheet polish: dropped the redundant plain text name (the sheet title already names the person); moved "Last signed in" out of the email line to its own line at the bottom, under the role and deactivate fields; the field renamed from `Active` to `Deactivate` as its label, with the switch itself kept reading `isActive` directly (checked means active): the switch is on when the account is active and turning it off is what deactivates. `onSubmit` hands back `isActive` unchanged, so `updateStaffRole` and everything past the sheet is unaffected. (An earlier pass briefly flipped the switch's own meaning to match the `Deactivate` label; reverted here because the label describes the field, the switch state still just is `isActive`.)
14. [x] Revision, wording: `Switched off` retired everywhere on this screen (the row status text and the sheet's helper line) in favour of `Deactivated`, matching the field's own `Deactivate` label. `staff-menu.tsx`'s own "Your account is switched off" notice, a different surface (what a switched off person sees of their own account, spec 0004), is untouched.

## Consequences

**Positive**:

- Closes the gap spec 0004 flagged and the scope has carried as a Deferred item since: role changes and switching a leaver off no longer need the Supabase dashboard.
- Every existing owner gated policy keeps working with a one line change to a single helper function, not eleven rewritten policies.
- A written record: every role or active change lands in `staff_audit` with who did it and when.
- Winston keeps every owner and admin capability after promoting himself to superadmin, because superadmin is a strict superset, not a separate track.
- After the owner parity revision, Ella (or whoever holds `owner`) can manage roles without needing Winston or a second superadmin promotion at all; `superadmin` is now purely for a second trusted person, not a prerequisite for the owner's own access.

**Negative / tradeoffs**:

- The "at most two superadmin" rule lives in the page only, not in Postgres (the owner half is a real unique index). A direct API call with a valid superadmin session, or a future second screen, could create a third superadmin with nothing in the database to stop it. Accepted for now at this scale; see Follow-up.
- `private.is_owner()` keeps its name while now meaning "owner or admin or superadmin". Cosmetic, not functional.
- `staff_audit` is a second, hand written audit table with the same shape as `reservation_audit` rather than a shared, generic audit mechanism; the project's audit trail is per table by convention already (spec 0002), so this follows the existing pattern rather than introducing a new one.
- The owner transfer and the self lockout guard both only take effect through `update_staff_role()`; any future write path to `staff.role` must re-implement both or call this same function.

**Neutral**:

- `staff.version` brings `staff` in line with `reservation`, `court` and `venue_settings`, all of which already carry one.
- No new environment variables or dashboard settings.

## Follow-up

- [ ] Winston runs the one time SQL promoting his own row from `owner` to `superadmin`, if he still wants to (build plan step 6; optional since the owner parity revision, because `owner` already carries this power).
- [ ] If a second door to changing `staff.role` ever opens (a script, a support tool, a future API), add a database level constraint or trigger enforcing "at most two `superadmin`" instead of relying on this screen's UI alone (the owner half of the cap already has one, `staff_single_owner_idx`).
- [ ] Consider renaming `private.is_owner()` to something like `private.is_admin_or_above()` now that it passes for three roles, for a future migration; not urgent, purely a naming clarity gap.
- [ ] Update the scope's Deferred entry "Staff management screen... from spec 0004": this spec answers it.
- [ ] The old confirm dialog said "`<person>` will become admin at the same time" when picking `owner` for someone while a different row held it. That warning has no home since the confirm step was dropped (build plan step 12); the sheet itself is silent on it. Worth adding to `UserSheet` directly if a transfer ever surprises someone, since it's the one change that also silently changes a second row.
