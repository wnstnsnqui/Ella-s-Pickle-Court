# Verify: staff roles & admin access · spec 0012 · updated 2026-09-18

_Steps derived from spec 0012 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Revised 2026-09-18 for the owner parity change (owner now carries the same power as superadmin), then again for editing moving to a `UserSheet` side sheet, and on 2026-09-21 for the confirm step returning behind the sheet's Continue button._

## UI / manual

- [x] Sign in as a `staff` or `admin` account and visit `/staff/admin/users` → redirected to `/staff` before any data loads → AC-1
- [x] Sign in as an active `owner` and visit `/staff/admin/users` → the page renders, a skeleton shows briefly, then every staff account (active and inactive) appears with name, email, role, active state and last signed in time → AC-1, AC-2
- [x] Sign in as an active `superadmin` and visit `/staff/admin/users` → same as the owner case → AC-1, AC-2
- [x] With a mix of roles seeded, load `/staff/admin/users` → the list reads owner first, then every superadmin, then every admin, then every staff, alphabetically by name within each group → AC-2
- [x] As the signed in owner or superadmin, find your own row → role and active state show as plain text with no edit button → AC-3
- [x] On another row, its role and status show as plain text; tap its edit (pencil) button → `UserSheet` opens from the side, filled with that person's name, email and last signed in time, and their current role and active flag → AC-3
- [x] In the sheet, the role picker offers `staff`, `admin`, `superadmin` and `owner`; `owner` is never disabled → AC-3
- [x] With two rows already `superadmin`, open the sheet on a third, non superadmin row → the `superadmin` role choice is disabled → AC-3
- [ ] Change the role or the active switch in the sheet and choose Continue → a confirm dialog opens over the sheet naming the person and reading out what changed; Go back returns to the sheet with the edits kept; Save closes both, the row updates, a success toast shows, and the change is reflected without a page reload → AC-3, AC-4, AC-5
- [x] As the current owner, transfer `owner` to someone else → the confirm dialog says you will become Admin at the same time, and on Save your own row becomes `admin` in the same write, and you are signed in as `admin` on your next read (no longer able to reach `/staff/admin/users`) → AC-4, AC-7, AC-9
- [x] As `owner` or `admin`, visit `/staff/settings` and `/staff/reports` → both render exactly as they did for `owner` before this feature → AC-12
- [x] As `staff`, visit `/staff/settings` and `/staff/reports` → redirected to `/staff`, same as before this feature → AC-12
- [x] Open the staff menu as `owner` or `superadmin` → a Users link appears, pointing at `/staff/admin/users`; as `admin` or `staff`, it does not appear → AC-12
- [x] View page source on `/staff/admin/users` → `<meta name="robots" content="noindex, nofollow">` (or equivalent) is present → AC-1

## Commands

- [x] `npm run check` (lint, format check, typecheck, unit tests) → green
- [x] `npm run test:db` (against the linked Supabase project) → green, `update_staff_role.test.ts` covers self lockout, stale version, non owner/superadmin refusal, an owner caller succeeding, the owner transfer with its two audit rows, and the partial unique index → AC-6, AC-7, AC-8, AC-9, AC-10
- [x] `npx supabase db advisors --linked` → only the pre-existing `authenticated_security_definer_function_executable` warning class, same as every other `security definer` function this project already ships → AC-11
- [x] Query `staff_audit` after a live role change through the screen → one row per row actually changed, with `changed_by` set to the acting owner's or superadmin's Clerk id and `old_row`/`new_row` populated → AC-10

## Acceptance-criteria coverage

- AC-1 … the redirect and noindex manual steps
- AC-2 … the page read, skeleton and error notice manual steps
- AC-3 … the own-row plain text, owner-always-selectable, and superadmin-cap manual steps
- AC-4 … the direct-save and owner-self-demotion manual steps
- AC-5 … the confirm-and-update manual step
- AC-6, AC-7, AC-8, AC-9, AC-10 … `npm run test:db`, `update_staff_role.test.ts`
- AC-11 … `npx supabase db advisors --linked`, and the grants asserted directly in the migration
- AC-12 … the settings/reports/staff-board and staff-menu manual steps
- AC-13 … not verifiable here; Winston's own one time SQL step (build plan step 6), now optional
- AC-14 … confirm `staff_role_changed` appears in PostHog after a live confirm; covered at the unit level by `lib/staff/actions.test.ts`'s `captureStaffEvent` assertion
