/**
 * The shapes the staff check hands the board. Spec 0016, the API surface.
 * Plain types in their own module, because a `"use server"` file may export
 * only async functions, and the Client Components need them too.
 */

/** Where an online booking stands (spec 0015, the `booking.status` check). */
export type BookingStatus =
  "held" | "pending_check" | "confirmed" | "rejected" | "expired" | "cancelled";

/** Whether the venue owes the money back, null when no refund question applies. */
export type RefundStatus = "owed" | "refunded" | "not_owed";

/** One run of adjacent hours on a court, as the board names it. */
export type OnlineRun = {
  courtId: number;
  courtName: string;
  startsAt: string;
  endsAt: string;
};

/** One booking in the To check or Refunds owed list (AC-2). */
export type OnlineCheckItem = {
  bookingId: number;
  code: string;
  customerName: string;
  amount: number;
  referenceLast4: string | null;
  status: BookingStatus;
  refundStatus: RefundStatus | null;
  submittedAt: string | null;
  /** The rows that stand for the booking, merged into runs, earliest first. */
  runs: OnlineRun[];
  /** The earliest `starts_at` among the booking's active rows, for the time tag (AC-16). */
  firstActiveStartsAt: string | null;
};

/** The chip and the list, in one read (AC-1, AC-2). */
export type OnlineChecks = {
  toCheck: OnlineCheckItem[];
  refundsOwed: OnlineCheckItem[];
  toCheckCount: number;
  refundCount: number;
  /** A section had more than the cap, so "Showing the first 50" shows under it. */
  more: { toCheck: boolean; refunds: boolean };
  /** The server's clock at the read; every time tag counts on from it. */
  serverNow: string;
};

export type BookingEventKind =
  "confirmed" | "rejected" | "cancelled" | "refunded" | "refund_not_owed";

/** One line of History (AC-6). */
export type BookingEventView = {
  id: number;
  kind: BookingEventKind;
  reason: string | null;
  note: string | null;
  refundOwed: boolean | null;
  amount: number | null;
  staffName: string;
  at: string;
};

/**
 * An online booking as the details sheet shows it (AC-6). Never the proof
 * path or the client hash: the screenshot is opened through `getProofUrl`.
 */
export type StaffBooking = {
  id: number;
  code: string;
  status: BookingStatus;
  version: number;
  amount: number;
  customerName: string;
  /** Null once the retention purge has cleared it (spec 0015, AC-23). */
  customerPhone: string | null;
  customerEmail: string | null;
  referenceLast4: string | null;
  submittedAt: string | null;
  refundStatus: RefundStatus | null;
  refundAmount: number | null;
  refundedAt: string | null;
  refundedByName: string | null;
  /** Whether a screenshot is still kept; false once the purge deleted it. */
  hasProof: boolean;
  runs: OnlineRun[];
  /** Newest first. */
  events: BookingEventView[];
  /** The viewer is an owner, admin or superadmin. Postgres still decides on every write. */
  canDecide: boolean;
};

/** A signed URL for the screenshot, valid until `expiresAt` (AC-17). */
export type ProofUrl = { url: string; expiresAt: string };

/** What every decision answers with: the booking's new version. */
export type DecisionResult = { version: number };
