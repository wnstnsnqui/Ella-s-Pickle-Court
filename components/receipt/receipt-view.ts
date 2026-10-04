import { formatBookingCode } from "@/lib/booking/code";
import { PAYMENT_METHOD_LABEL } from "@/lib/booking/constants";
import {
  CONFIRMED_LINE,
  LOOKUP_REASON_LINES,
  NOT_BOOKED_LINE,
  refundLine,
} from "@/lib/booking/lookup";
import type { BookingLookup, BookingReceipt, BookingRun, LookupView } from "@/lib/booking/types";
import { VENUE_TIMEZONE } from "@/lib/env";
import { calendarDateInZone, formatAtVenue, formatDayHeading } from "@/lib/time";
import { formatPeso } from "@/lib/venue";

/**
 * One receipt for every surface (spec 0017, the Decision, invariant 7). The
 * checkout's last step, the `/booking` lookup, the printed page and the saved
 * image all read a `ReceiptView`, so the four can never disagree. Pure, so it
 * is tested without a browser.
 */

/** A court as the receipt names it. */
export type ReceiptCourt = { id: number; name: string };

/** One row of a facts group: a term on the left, its value on the right. */
export type ReceiptFact = { term: string; value: string };

export type ReceiptView = {
  /** Where the receipt is shown. The checkout prints its own contact in full; the lookup masks it. */
  source: "checkout" | "lookup";
  status: LookupView;
  /** The badge: "Confirmed", "Cancelled", "Not booked". */
  word: string;
  /** "Booking confirmed", "Booking cancelled", "Not booked". */
  title: string;
  /** Under the badge: the status line, then the refund line when there is one. */
  lines: string[];
  /** Grouped `XXXX-XXXX`, as a person reads it. */
  code: string;
  /** Stored, with no dash: what "Track this booking" and the text body carry. */
  storedCode: string;
  /** The day, from `formatDayHeading`. A booking covers one day (spec 0015, AC-1). */
  heading: string;
  courts: ReceiptCourt[];
  runs: BookingRun[];
  amount: number;
  customer: ReceiptFact[];
  payment: ReceiptFact[];
  /** "Total paid" only while the booking stands; otherwise "Total" (AC-5, AC-7). */
  totalLabel: string;
  total: string;
};

/** How a submitted time reads on every receipt: "Fri 30 Oct, 5:05 pm". */
function sentAt(instant: string): string {
  return formatAtVenue(instant, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

const WORDS: Record<LookupView, { word: string; title: string }> = {
  confirmed: { word: "Confirmed", title: "Booking confirmed" },
  cancelled: { word: "Cancelled", title: "Booking cancelled" },
  not_booked: { word: "Not booked", title: "Not booked" },
};

export type ReceiptSource =
  | {
      source: "checkout";
      receipt: BookingReceipt;
      heading: string;
      courts: readonly ReceiptCourt[];
    }
  | { source: "lookup"; lookup: BookingLookup };

export function buildReceiptView(input: ReceiptSource): ReceiptView {
  return input.source === "checkout" ? fromCheckout(input) : fromLookup(input.lookup);
}

/**
 * The checkout's receipt (spec 0015, AC-14). "Confirmed" is fixed copy, never
 * `booking.status`: staff still read "Payment not yet checked".
 */
function fromCheckout({
  receipt,
  heading,
  courts,
}: Extract<ReceiptSource, { source: "checkout" }>): ReceiptView {
  const customer: ReceiptFact[] = [{ term: "Name", value: receipt.customer.name }];
  if (receipt.customer.phone) customer.push({ term: "Mobile", value: receipt.customer.phone });
  if (receipt.customer.email) customer.push({ term: "Email", value: receipt.customer.email });
  return {
    source: "checkout",
    status: "confirmed",
    ...WORDS.confirmed,
    lines: [CONFIRMED_LINE],
    code: formatBookingCode(receipt.code),
    storedCode: receipt.code,
    heading,
    courts: [...courts],
    runs: receipt.runs,
    amount: receipt.amount,
    customer,
    payment: [
      { term: "Method", value: PAYMENT_METHOD_LABEL },
      { term: "Reference", value: `•••• ${receipt.payment.referenceLast4}` },
      { term: "Proof", value: "Screenshot received" },
      { term: "Submitted", value: sentAt(receipt.payment.submittedAt) },
    ],
    totalLabel: "Total paid",
    total: formatPeso(receipt.amount),
  };
}

/** The status line under the badge (AC-3, AC-5, AC-7). */
function statusLine(lookup: BookingLookup): string {
  switch (lookup.view) {
    case "confirmed":
      return CONFIRMED_LINE;
    case "cancelled":
      return LOOKUP_REASON_LINES[lookup.reason ?? "other"];
    case "not_booked":
      return NOT_BOOKED_LINE;
  }
}

/**
 * The lookup's receipt (spec 0017, AC-3 to AC-7). The contact arrives masked
 * from the database (AC-4); no reference digits are shown or held (AC-18).
 */
function fromLookup(lookup: BookingLookup): ReceiptView {
  const first = lookup.runs[0];
  const heading = first
    ? formatDayHeading(calendarDateInZone(new Date(first.startsAt), VENUE_TIMEZONE))
    : "";
  const courts = [...new Map(lookup.runs.map((run) => [run.courtId, run.courtName]))]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.id - b.id);

  const customer: ReceiptFact[] = [];
  if (lookup.customer.firstName) customer.push({ term: "Name", value: lookup.customer.firstName });
  if (lookup.customer.phoneLast4) {
    customer.push({ term: "Mobile", value: `•••• ${lookup.customer.phoneLast4}` });
  }
  if (lookup.customer.emailMasked) {
    customer.push({ term: "Email", value: lookup.customer.emailMasked });
  }

  const refund = refundLine(lookup.refund);
  return {
    source: "lookup",
    status: lookup.view,
    ...WORDS[lookup.view],
    lines: refund ? [statusLine(lookup), refund] : [statusLine(lookup)],
    code: formatBookingCode(lookup.code),
    storedCode: lookup.code,
    heading,
    courts,
    runs: lookup.runs.map(({ courtId, startsAt, endsAt, amount }) => ({
      courtId,
      startsAt,
      endsAt,
      amount,
    })),
    amount: lookup.amount,
    customer,
    payment: [
      { term: "Method", value: PAYMENT_METHOD_LABEL },
      { term: "Sent", value: sentAt(lookup.submittedAt) },
    ],
    totalLabel: lookup.view === "confirmed" ? "Total paid" : "Total",
    total: formatPeso(lookup.amount),
  };
}
