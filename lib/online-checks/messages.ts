import type { DecisionReason } from "./constants";
import { formatAmount } from "./format";

/**
 * The text a manager sends the player before turning a payment down or
 * cancelling (spec 0016, AC-9). Pending Ella's approval (Follow-up). The app
 * prepares it and never stores it, nor records whether it was sent.
 */

/** One line per reason, after the opening that names the booking. `{amount}` is the amount due. */
export const PLAYER_MESSAGES: Record<DecisionReason, string> = {
  no_payment:
    "We couldn't find your payment, so we've cancelled the booking and freed the slots. If you did pay, reply with your receipt and we'll sort it out.",
  amount_mismatch:
    "The amount we received doesn't match the {amount} due, so we've cancelled the booking.",
  reference_mismatch:
    "We couldn't match your payment's reference number, so we've cancelled the booking.",
  invalid_proof:
    "The screenshot you sent doesn't show a completed payment, so we've cancelled the booking. If you did pay, reply with your receipt and we'll sort it out.",
  player_asked: "As you asked, we've cancelled your booking.",
  payment_reversed: "Your payment was reversed, so we've cancelled the booking.",
  venue_issue: "We're sorry, we've had to cancel your booking because of a problem at the venue.",
  other: "We've had to cancel your booking. Message us if you have any questions.",
};

/** The first word of the trimmed name, or all of it when it is one word. */
export function playerFirstName(customerName: string): string {
  const trimmed = customerName.trim();
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function buildPlayerMessage({
  reason,
  customerName,
  code,
  firstRun,
  amount,
  refundOwed,
}: {
  reason: DecisionReason;
  customerName: string;
  /** As the player reads it, with the dash. */
  code: string;
  /** "Fri 30 Oct, 6pm". */
  firstRun: string;
  amount: number;
  refundOwed: boolean;
}): string {
  const opening = `Hi ${playerFirstName(customerName)}, this is Ella's Picklecourt about your booking ${code} (${firstRun}).`;
  const body = PLAYER_MESSAGES[reason].replace("{amount}", formatAmount(amount));
  const refund = refundOwed
    ? ` We'll send ${formatAmount(amount)} back to the account you paid from.`
    : "";
  return `${opening} ${body}${refund}`;
}
