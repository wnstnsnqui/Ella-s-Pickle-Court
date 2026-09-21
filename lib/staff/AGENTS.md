# Staff Server Actions

## Overview

The Server Action boundary behind `/staff/admin/users`: role and active status writes, and
the one time invite and reset links of spec 0004. `lib/staff.ts` covers reads
(`currentStaff()`, `getAllStaff()`, `getPendingInvites()`); this folder covers writes.

## Key files

| File         | Owns                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `actions.ts` | `updateStaffRole()`, `createStaffInvite()` and `revokeStaffInvite()`, the writes behind the admin users screen, and `refreshAllStaff()` and `refreshPendingInvites()`, the page's own refetches after a write or a stale version |

## Conventions

- `updateStaffRole()` is a thin wrapper over the `update_staff_role()` Postgres function, which is the real enforcement point: owner or superadmin only, refused on a caller's own row, and a previous owner demoted in the same transaction as a transfer. The Server Action adds nothing the function does not already check, per spec 0001's rule that authorization is a row level security policy, never an `if` here.
- `updateStaffRole()` fires `staff_role_changed` through `captureStaffEvent()` only after a successful write, and never awaits it.
- `createStaffInvite()` and `revokeStaffInvite()` wrap the `create_staff_invite()` and `revoke_staff_invite()` Postgres functions the same way (owner or superadmin only, enforced in SQL). The plain token is made and hashed here, only the sha256 hex is stored, and the URL is built on `BETTER_AUTH_URL`. A `22023` from `create_staff_invite()` is the function refusing on its own terms and maps to `invalid` with the function's message; a link already used or revoked maps to `conflict` with its own line in `lib/actions.ts`.

## Related specs

- [0012 Staff roles, admin and superadmin](../../docs/specs/0012-staff-roles-admin-superadmin/index.md)

_Drafted by /sync from the introducing change, worth a quick human pass._
