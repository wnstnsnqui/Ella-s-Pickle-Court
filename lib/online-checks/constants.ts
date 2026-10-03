import type { BookingStatus } from "./types";

/**
 * The fixed lists and rules of the staff check (spec 0016). A plain module
 * with no `server-only` import, so the sheet's Client Components and the
 * Server Actions read the same lists.
 */

/** Each list section shows at most this many bookings (AC-2). */
export const CHECKS_LIST_CAP = 50;

/** A decision note, after trimming (AC-8, AC-12). */
export const NOTE_MAX = 200;

/** The most a refund can record (AC-12). */
export const REFUND_MAX = 99_999.99;

/** How long a screenshot URL lasts, in seconds (AC-17). */
export const PROOF_URL_SECONDS = 300;

/** Why a payment is turned down (AC-8), in the order the step lists them. */
export const REJECT_REASONS = [
  { value: "no_payment", label: "No payment found" },
  { value: "amount_mismatch", label: "Amount doesn't match" },
  { value: "reference_mismatch", label: "Reference doesn't match" },
  { value: "invalid_proof", label: "Screenshot isn't a valid payment" },
  { value: "other", label: "Other" },
] as const;

/** Why a booking is cancelled (AC-10). */
export const CANCEL_REASONS = [
  { value: "player_asked", label: "Player asked to cancel" },
  { value: "payment_reversed", label: "Payment reversed or disputed" },
  { value: "venue_issue", label: "Venue issue (court closed, weather)" },
  { value: "other", label: "Other" },
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number]["value"];
export type CancelReason = (typeof CANCEL_REASONS)[number]["value"];
export type DecisionReason = RejectReason | CancelReason;

export const REJECT_REASON_VALUES = REJECT_REASONS.map((reason) => reason.value) as [
  RejectReason,
  ...RejectReason[],
];
export const CANCEL_REASON_VALUES = CANCEL_REASONS.map((reason) => reason.value) as [
  CancelReason,
  ...CancelReason[],
];

/** A reason's words, from either list. */
export function reasonLabel(reason: string): string {
  const found = [...REJECT_REASONS, ...CANCEL_REASONS].find((entry) => entry.value === reason);
  return found?.label ?? reason;
}

/**
 * Whether "Money was received, a refund is owed" starts ticked (AC-8, AC-10):
 * for the two turn down reasons that mean money did arrive, and for a cancel
 * of a booking already confirmed.
 */
export function refundDefault(
  step: "turn_down" | "cancel",
  reason: DecisionReason | null,
  status: BookingStatus,
): boolean {
  if (step === "cancel") return status === "confirmed";
  return reason === "amount_mismatch" || reason === "reference_mismatch";
}

/** The 31 character booking code alphabet: no 0, 1, I, L or O (spec 0015, AC-18). */
const CODE_PATTERN = /^[2-9A-HJKMNP-Z]{8}$/;

/**
 * A typed code as stored: the dash and spaces removed, upper case. Null
 * unless it is exactly 8 characters from the alphabet (AC-3), so nothing
 * shorter ever reaches the database.
 */
export function normalizeBookingCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, "").toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

export const CODE_INVALID_MESSAGE = "A code is 8 letters and numbers, like K7MQ-3XPT.";
export const CODE_NOT_FOUND_MESSAGE = "No online booking with that code.";

/** What a sheet says when its decision lost a race (AC-14). */
export const STALE_MESSAGE = "Someone else just updated this booking. Here's where it stands now.";

/** What plain staff read where the decision buttons would be (AC-7). */
export const MANAGERS_ONLY_MESSAGE = "Only an owner or admin can confirm or turn down a payment.";

/** What a refused change to an online row says (AC-11). */
export const GUARD_MESSAGE = "This is an online booking. Use its own buttons in the sheet.";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * A To check item's time tag (AC-16), against the server's clock: "Starts in
 * 25 min" in the hour before its first active slot, "Started, not checked"
 * once that slot has begun, and how long ago it was sent otherwise.
 */
export function timeTag(
  firstActiveStartsAt: string | null,
  submittedAt: string | null,
  now: number,
): string | null {
  if (firstActiveStartsAt) {
    const until = Date.parse(firstActiveStartsAt) - now;
    if (until <= 0) return "Started, not checked";
    if (until <= HOUR) return `Starts in ${Math.max(1, Math.ceil(until / MINUTE))} min`;
  }
  if (!submittedAt) return null;
  const since = Math.max(0, now - Date.parse(submittedAt));
  if (since < MINUTE) return "Sent just now";
  if (since < HOUR) return `Sent ${Math.floor(since / MINUTE)} min ago`;
  if (since < 48 * HOUR) return `Sent ${Math.floor(since / HOUR)} hr ago`;
  return `Sent ${Math.floor(since / (24 * HOUR))} days ago`;
}
