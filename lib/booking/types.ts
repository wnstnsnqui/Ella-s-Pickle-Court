import type { DecisionReason } from "@/lib/online-checks/constants";

/**
 * The shapes the online booking actions hand the sheet. Spec 0015, the API
 * surface. Plain types in their own module, because a `"use server"` file may
 * export only async functions.
 */

/** One picked hour, as the grid names it. */
export type SlotRef = { courtId: number; startsAt: string };

/** One reservation row of a booking: a run of adjacent hours on a court, with its share. */
export type BookingRun = { courtId: number; startsAt: string; endsAt: string; amount: number };

/** A live hold, as the player's own sheet sees it. */
export type HeldBooking = {
  /** Stored without the dash; `formatBookingCode()` shows it. */
  code: string;
  holdExpiresAt: string;
  /** The database's clock when it answered, so the countdown never trusts the device. */
  serverNow: string;
  amount: number;
  runs: BookingRun[];
  /** Where the screenshot goes: a signed URL for the booking's one proof path (AC-20 keeps the path itself off the wire). */
  upload: { signedUrl: string };
};

export type HoldRefusal =
  | { kind: "slot_taken"; message: string; slots: SlotRef[] }
  | { kind: "out_of_range"; message: string }
  | { kind: "rate_limited"; message: string; retryAfterSeconds: number }
  | { kind: "bot_check"; message: string }
  | { kind: "invalid"; message: string; issues: Record<string, string[]> }
  | { kind: "failed"; message: string };

export type HoldResult = { ok: true; data: HeldBooking } | { ok: false; error: HoldRefusal };

/** The receipt, as the player's own sheet sees it (AC-14). Only the player ever gets this. */
export type BookingReceipt = {
  code: string;
  status: string;
  amount: number;
  runs: BookingRun[];
  customer: { name: string; phone: string | null; email: string | null };
  payment: { referenceLast4: string; submittedAt: string };
  /** The hold had lapsed and the same slots were taken again (AC-12). */
  retaken: boolean;
};

export type SubmitRefusal =
  | { kind: "slot_taken"; message: string; slots: SlotRef[] }
  | { kind: "proof_missing"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "failed"; message: string };

export type SubmitResult = { ok: true; data: BookingReceipt } | { ok: false; error: SubmitRefusal };

/** Whether closing the sheet ended a live hold (AC-15). Nothing is shown either way. */
export type ReleaseResult = { released: boolean };

/** What the player reads on `/booking` for a found code (spec 0017, AC-3, AC-5, AC-7). */
export type LookupView = "confirmed" | "cancelled" | "not_booked";

/** A run as the lookup names it: the court comes back by name, retired courts too. */
export type LookupRun = BookingRun & { courtName: string };

/** Money on its way back, or already sent (AC-6). */
export type LookupRefund =
  { status: "owed"; amount: number } | { status: "refunded"; amount: number; refundedAt: string };

/**
 * A booking as anybody holding its code may see it (AC-18): the contact comes
 * masked from the database, and there is no booking id, reference, proof
 * path, staff name or note to show.
 */
export type BookingLookup = {
  view: LookupView;
  /** Stored without the dash; `formatBookingCode()` shows it. */
  code: string;
  /** Why it was called off, as a code; `LOOKUP_REASON_LINES` has the words. */
  reason: DecisionReason | null;
  refund: LookupRefund | null;
  customer: { firstName: string | null; phoneLast4: string | null; emailMasked: string | null };
  amount: number;
  submittedAt: string;
  runs: LookupRun[];
};

export type LookupRefusal =
  | { kind: "invalid"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "ended"; message: string; endedAt: string }
  | { kind: "rate_limited"; message: string; retryAfterSeconds: number }
  | { kind: "failed"; message: string };

export type LookupResult = { ok: true; data: BookingLookup } | { ok: false; error: LookupRefusal };
