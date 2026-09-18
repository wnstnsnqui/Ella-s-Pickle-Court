# 0012. Admin and superadmin roles, with a user management screen — rationale

## Context

Spec 0004 gave the app two roles, `staff` and `owner`, with the first person ever to sign in becoming `owner`. It deliberately left role changes and switching a leaver off as a database editor job, flagged in its own Follow up as a gap for a non technical owner. That gap is still open on the scope (`Deferred`: "Staff management screen... from spec 0004").

Winston now wants two more roles: `admin`, who should stand equal to `owner` everywhere except the new screen, and `superadmin`, his own role, which adds the one capability nobody has had yet: seeing every staff account in one place and assigning or changing anyone's role without touching Supabase directly.

Two things make this more than "add a value to an enum". First, `owner` and `superadmin` are each meant to describe exactly one person, and `superadmin` at most two, at any moment, so choosing a new value for one of those roles has to account for whoever holds it already. Second, every owner gated write in the app (courts, opening hours, the usage report) is enforced by a single Postgres helper function keyed on `role = 'owner'`, so widening who counts as owner equivalent is a database change, not a page change.

## Options considered

### Option 1: Widen the existing role column and its helper function

Add `admin` and `superadmin` to the `staff.role` check constraint, widen the existing `private.is_owner()` helper to treat all three privileged roles alike, and add a single Postgres function, `update_staff_role()`, plus an audit table for the one capability that stays exclusive: its `superadmin` check is inlined in the function itself, not a new RLS predicate reused elsewhere.

**Pros**:

- Every existing owner gated policy keeps working unchanged; only the helper's body changes, not the eleven places that call it.
- One column, one small set of new database objects. No new table for staff data itself.
- Matches spec 0004's own model exactly: role stays a single column `staff` already has. Every existing read and every owner gated write stays enforced by RLS, exactly as before; the one new write path is enforced by grants and a `security definer` function instead, the same mechanism `ensure_staff()` already uses.

**Cons**:

- `private.is_owner()` becomes a slightly misleading name now that it also passes for `admin` and `superadmin`; a rename is a small follow up, not a blocker.
- The "at most two superadmin" rule lives only in the page's own logic (Winston's choice, see Rationale), so a direct database write or a future second screen could put a third row on `superadmin` with nothing in Postgres to stop it. The "at most one owner" half of the rule is cheap enough to enforce for real (a partial unique index), so it does not share this gap.

### Option 2: A separate roles or permissions table

Move away from a single `role` column on `staff` toward a `staff_role` join table (or a `permissions` table keyed by capability), letting a person hold more than one role or a custom set of capabilities.

**Pros**:

- More flexible if the app ever needs multiple roles per person or fine grained, per capability permissions.

**Cons**:

- Every existing policy and every place that reads `staff.role` (11 RLS policies, `currentStaff()`, `staff-menu.tsx`, two page guards) would need rewriting to join against a new table, for a need (one role per person, four values) that does not exist yet.
- Nothing in this request calls for more than one role per person; this is solving a problem Winston does not have.

### Option 3: Move roles into Clerk (organizations and roles)

Use Clerk's own organization roles feature instead of a Postgres column, and gate pages on the Clerk role claim.

**Pros**:

- One less column to maintain in Postgres; Clerk already has a UI for managing org members.

**Cons**:

- Directly contradicts the project's own rule that authorization is a row level security policy, never an `if` in a Server Action or a claim check; every write today is enforced in Postgres, and this would split enforcement across two systems.
- Spec 0001's identity decision already chose Clerk for who someone is, and Postgres RLS for what they may do; moving roles to Clerk reopens that decision for no stated benefit.

## Rationale

Option 1 keeps the blast radius to exactly the two things that changed: a new value set for `role`, and a new, narrow write path for changing it. Every one of the eleven existing policies that already key on `private.is_owner()` needs no edit at all, because the widening happens once, inside the helper's body (`create or replace function`), not at each call site. This is the direct answer to the two forces in Context: an `owner` equivalent role (`admin`) that should not require touching policy code, and a genuinely new capability (`superadmin`'s role management) that gets its own narrow, auditable door instead of a general purpose one.

On the "at most one owner, at most two superadmin" rule: the owner half is cheap to make real (one partial unique index on `staff (role) where role = 'owner'`), which also closes a genuine race, two simultaneous owner transfers, that UI logic alone cannot prevent. The superadmin half stays UI only (the dropdown disables the option once two rows hold it) rather than a second constraint, because at this scale (a handful of staff, superadmin membership changing rarely) the app is the only door this ever goes through, and a count based constraint needs a trigger, not an index. This is recorded as a deliberate, revisitable tradeoff, not an oversight: `## Follow-up` (in `index.md`) carries it as the first thing to add if a second door to `update_staff_role` (a script, a support tool) ever opens.

Options 2 and 3 both solve for flexibility the project does not need yet (multiple roles per person, or authorization living outside Postgres) at the cost of touching code that already works. Boring wins here: one column, one function, one new table.
