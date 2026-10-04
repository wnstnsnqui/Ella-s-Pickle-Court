import { describe, expect, it } from "vitest";

import { manila } from "@/components/landing/test-fixture";
import type { BookingLookup, BookingReceipt } from "@/lib/booking/types";
import { formatPeso, VENUE_NAME } from "@/lib/venue";

import { receiptImageModel } from "./receipt-image";
import { buildReceiptView } from "./receipt-view";

/** Spec 0015, AC-14 (second amendment 2026-10-02): the saved image prints what the receipt shows. */

const DAY = "2026-10-30";
const courts = [
  { id: 1, name: "Court 1" },
  { id: 2, name: "Court 2" },
];

const receipt: BookingReceipt = {
  code: "K7MQ3XPT",
  status: "pending_check",
  amount: 750,
  runs: [
    { courtId: 2, startsAt: manila(DAY, "18:00"), endsAt: manila(DAY, "19:00"), amount: 250 },
    { courtId: 1, startsAt: manila(DAY, "21:00"), endsAt: manila(DAY, "23:00"), amount: 500 },
  ],
  customer: { name: "Ana Reyes", phone: "+639171234567", email: null },
  payment: { referenceLast4: "1234", submittedAt: manila(DAY, "17:05") },
  retaken: false,
};

describe("the receipt image", () => {
  const model = receiptImageModel(
    buildReceiptView({ source: "checkout", receipt, heading: "Fri 30 Oct", courts }),
  );

  it("reads Booking confirmed with the check, the staff line in the footer", () => {
    expect(model.status).toBe("confirmed");
    expect(model.title).toBe("Booking confirmed");
    expect(model.word).toBe("Confirmed");
    expect(model.totalLabel).toBe("Total paid");
    expect(model.notes).toEqual([]);
    expect(model.footer[0]).toContain("Staff check every payment");
  });

  it("carries the venue, the grouped code and the total, and names the file by the code", () => {
    expect(model.venue).toBe(VENUE_NAME);
    expect(model.code).toBe("K7MQ-3XPT");
    expect(model.total).toBe(formatPeso(750));
    expect(model.fileName).toBe("booking-K7MQ-3XPT.png");
  });

  it("lists the runs in the card's order, courts first then time", () => {
    expect(model.runs).toEqual([
      { court: "Court 1", when: "Fri 30 Oct · 9pm to 11pm", chip: "2 hr" },
      { court: "Court 2", when: "Fri 30 Oct · 6pm to 7pm", chip: "1 hr" },
    ]);
  });

  it("leaves out a missing email and masks the reference", () => {
    expect(model.customer.map((fact) => fact.term)).toEqual(["Name", "Mobile"]);
    expect(model.payment).toContainEqual({ term: "Reference", value: "•••• 1234" });
  });
});

/** Spec 0017, AC-15: the lookup's image draws the view the page shows, masked, with no reference. */
describe("the lookup's receipt image", () => {
  const lookup: BookingLookup = {
    view: "cancelled",
    code: "K7MQ3XPT",
    reason: "no_payment",
    refund: { status: "owed", amount: 750 },
    customer: { firstName: "Ana", phoneLast4: "4567", emailMasked: "a•••@example.com" },
    amount: 750,
    submittedAt: manila(DAY, "17:05"),
    runs: [
      {
        courtId: 1,
        courtName: "Court 1",
        startsAt: manila(DAY, "21:00"),
        endsAt: manila(DAY, "23:00"),
        amount: 500,
      },
    ],
  };
  const model = receiptImageModel(buildReceiptView({ source: "lookup", lookup }));

  it("names the status, the reason and the refund under the title", () => {
    expect(model.title).toBe("Booking cancelled");
    expect(model.word).toBe("Cancelled");
    expect(model.notes).toEqual([
      "We couldn't find your payment.",
      `Refund on its way: ${formatPeso(750)}`,
    ]);
    expect(model.totalLabel).toBe("Total");
  });

  it("prints the masked contact and never a reference", () => {
    expect(model.customer).toEqual([
      { term: "Name", value: "Ana" },
      { term: "Mobile", value: "•••• 4567" },
      { term: "Email", value: "a•••@example.com" },
    ]);
    expect(model.payment.map((fact) => fact.term)).toEqual(["Method", "Sent"]);
  });
});
