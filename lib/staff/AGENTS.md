# Staff Server Actions

## Overview

The Server Action boundary behind `/staff/admin/users`: role and active status writes.
`lib/staff.ts` covers reads (`currentStaff()`, `getAllStaff()`); this folder covers writes.

## Key files

| File         | Owns                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `actions.ts` | `updateStaffRole()`, the sole write behind the admin users screen, and `refreshAllStaff()`, the page's own refetch after a write or a stale version |

## Conventions

- `updateStaffRole()` is a thin wrapper over the `update_staff_role()` Postgres function, which is the real enforcement point: owner or superadmin only, refused on a caller's own row, and a previous owner demoted in the same transaction as a transfer. The Server Action adds nothing the function does not already check, per spec 0001's rule that authorization is a row level security policy, never an `if` here.
- `updateStaffRole()` fires `staff_role_changed` through `captureStaffEvent()` only after a successful write, and never awaits it.

## Related specs

- [0012 Staff roles, admin and superadmin](../../docs/specs/0012-staff-roles-admin-superadmin/index.md)

_Drafted by /sync from the introducing change, worth a quick human pass._
