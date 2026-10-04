import { VENUE_TIMEZONE } from "@/lib/env";
import type { DecisionReason } from "@/lib/online-checks/constants";
import { calendarDateInZone, formatDayHeading } from "@/lib/time";
import { formatPeso } from "@/lib/venue";

import type { LookupRefund } from "./types";

/**
 * The words `/booking` prints for each answer (spec 0017). Pure and free of
 * `server-only`, so the action and the page share one copy. Every line here
 * is pending Ella's approval with spec 0016's player messages (Follow-up).
 */

/** One plain line per reason a booking was called off (AC-5). Never the staff note. */
export const LOOKUP_REASON_LINES: Record<DecisionReason, string> = {
  no_payment: "We couldn't find your payment.",
  amount_mismatch: "The amount we received didn't match the amount due.",
  reference_mismatch: "We couldn't match your payment's reference number.",
  invalid_proof: "The screenshot didn't show a completed payment.",
  player_asked: "You asked us to cancel.",
  payment_reversed: "Your payment was reversed.",
  venue_issue: "We had to close the court.",
  other: "Message us if you have any questions.",
};

/** Under Confirmed: the same words the checkout receipt prints (AC-3). */
export const CONFIRMED_LINE =
  "Staff check every payment. If yours doesn't match, we'll message you.";

/** Under Not booked (AC-7). */
export const NOT_BOOKED_LINE = "Your payment arrived after your slots were taken.";

export const NOT_FOUND_MESSAGE =
  "We couldn't find a booking with that code. Check it against your receipt, or message us.";

export const LOOKUP_FAILED_MESSAGE = "We couldn't check your booking just now.";

/** A day as the lookup names it: the venue's calendar day of an instant. */
function venueDay(instant: string): string {
  return formatDayHeading(calendarDateInZone(new Date(instant), VENUE_TIMEZONE));
}

/**
 * AC-9: "This booking ended on Sat 31 Oct." The instant is the last run's
 * start, so a run ending at midnight still names its own day.
 */
export function endedMessage(lastRunStartsAt: string): string {
  return `This booking ended on ${venueDay(lastRunStartsAt)}. Message us if you need its receipt.`;
}

/** Whole minutes to wait, never 0: the rounding checkout uses (spec 0015). */
export function retryMinutes(retryAfterSeconds: number): number {
  return Math.max(1, Math.ceil(retryAfterSeconds / 60));
}

/** AC-10: "Too many wrong codes from this connection. Try again in 12 minutes, or message us." */
export function limitedMessage(retryAfterSeconds: number): string {
  const minutes = retryMinutes(retryAfterSeconds);
  return `Too many wrong codes from this connection. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}, or message us.`;
}

/** AC-6: "Refund on its way: ₱1,000", or "Refunded ₱1,000 on Sat 31 Oct". */
export function refundLine(refund: LookupRefund | null): string | null {
  if (!refund) return null;
  if (refund.status === "owed") return `Refund on its way: ${formatPeso(refund.amount)}`;
  return `Refunded ${formatPeso(refund.amount)} on ${venueDay(refund.refundedAt)}`;
}
