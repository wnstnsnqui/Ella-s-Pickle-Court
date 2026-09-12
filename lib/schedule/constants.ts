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

/** Who a staff row is. Only an owner may touch courts, settings, or the past. */
export const STAFF_ROLES = ["staff", "owner"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** The slot lengths Ella may choose between. */
export const SLOT_MINUTES = [30, 60, 90] as const;
export type SlotMinutes = (typeof SLOT_MINUTES)[number];

/**
 * What a cell on the grid reads. Derived at read time, never stored (invariant 7).
 * `Selected` is deliberately absent: it is browser state for a later feature.
 */
export const CELL_STATES = ["available", "booked", "unavailable"] as const;
export type CellState = (typeof CELL_STATES)[number];
