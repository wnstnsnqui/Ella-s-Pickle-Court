import { describe, expect, it } from "vitest";

import type { BookingReceipt } from "@/lib/booking/types";
import { formatPeso, VENUE_NAME } from "@/lib/venue";

import { receiptImageModel } from "./receipt-image";
import { manila } from "./test-fixture";

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
  const model = receiptImageModel(receipt, "Fri 30 Oct", courts);

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
