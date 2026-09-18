/**
 * The value lists for spec 0002, defined exactly once.
 *
 * Invariant 8: `kind`, `status` and `payment_status` have one definition, here.
 * The Zod schemas in `schemas.ts` are built from these arrays, and the check
 * constraints in the migration copy the same values. `constants.test.ts` reads
 * the migration back and fails if the two ever drift apart, which is what makes
 * AC-12 hold rather than being a promise.
 */

/** A reservation is either somebody's booking or the venue closing the court. */
export const RESERVATION_KINDS = ["booking", "closed"] as const;
export type ReservationKind = (typeof RESERVATION_KINDS)[number];

/** One way: `active` becomes `cancelled` and stays there. */
export const RESERVATION_STATUSES = ["active", "cancelled"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Money moves freely between these four, because money gets corrected. */
export const PAYMENT_STATUSES = ["unpaid", "partial", "paid", "waived"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Who a staff row is. `owner`, `admin` and `superadmin` stand equal on every
 * owner gated surface; `owner` and `superadmin` also stand equal on
 * `/staff/admin/users`, which `admin` cannot reach. Spec 0012.
 */
export const STAFF_ROLES = ["staff", "owner", "admin", "superadmin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * `owner`, `admin` and `superadmin` stand equal everywhere except
 * `/staff/admin/users`. Spec 0012.
 *
 * Lives here, not in `lib/staff.ts`, because this file carries no
 * `server-only` import: `components/staff/staff-board.tsx` (a client
 * component) needs it too, and importing anything from `lib/staff.ts` pulls
 * its `server-only` guard into the client bundle and fails the build.
 */
export function isOwnerLevel(role: StaffRole): boolean {
  return role === "owner" || role === "admin" || role === "superadmin";
}

/**
 * Who may reach `/staff/admin/users` and change someone else's role or
 * active flag: `owner` and `superadmin` stand equal here, `admin` does not.
 * Spec 0012, revised so owner carries the same power as superadmin.
 */
export function canManageStaffRoles(role: StaffRole): boolean {
  return role === "owner" || role === "superadmin";
}

/** Top to bottom order for the `/staff/admin/users` list, most privileged first. */
export const STAFF_ROLE_DISPLAY_ORDER = [
  "owner",
  "superadmin",
  "admin",
  "staff",
] as const satisfies readonly StaffRole[];

/** The slot lengths Ella may choose between. */
export const SLOT_MINUTES = [30, 60, 90] as const;
export type SlotMinutes = (typeof SLOT_MINUTES)[number];

/**
 * What a cell on the grid reads. Derived at read time, never stored (invariant 7).
 * `Selected` is deliberately absent: it is browser state for a later feature.
 */
export const CELL_STATES = ["available", "booked", "unavailable"] as const;
export type CellState = (typeof CELL_STATES)[number];
