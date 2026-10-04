import { describe, expect, it } from "vitest";

import { manila } from "@/components/landing/test-fixture";
import type { BookingLookup, BookingReceipt } from "@/lib/booking/types";
import { formatPeso } from "@/lib/venue";

import { buildReceiptView } from "./receipt-view";

/**
 * Spec 0017, AC-3 to AC-7 and invariant 7: every surface reads one view, and
 * the view says what each state promises: the word, the title, the line under
 * the badge, the refund, the masked contact and which total label.
 */

const DAY = "2026-10-30";

const base: BookingLookup = {
  view: "confirmed",
  code: "K7MQ3XPT",
  reason: null,
  refund: null,
  customer: { firstName: "Ana", phoneLast4: "4567", emailMasked: "a•••@example.com" },
  amount: 1000,
  submittedAt: manila(DAY, "17:05"),
  runs: [
    {
      courtId: 2,
      courtName: "Court 2",
      startsAt: manila(DAY, "18:00"),
      endsAt: manila(DAY, "19:00"),
      amount: 250,
    },
    {
      courtId: 1,
      courtName: "Court 1",
      startsAt: manila(DAY, "21:00"),
      endsAt: manila(DAY, "24:00"),
      amount: 750,
    },
  ],
};

const lookup = (overrides: Partial<BookingLookup>) =>
  buildReceiptView({ source: "lookup", lookup: { ...base, ...overrides } });

describe("the lookup's receipt view", () => {
  it("reads Confirmed with the staff line and Total paid, whatever the check (AC-3)", () => {
    const view = lookup({});
    expect(view.word).toBe("Confirmed");
    expect(view.title).toBe("Booking confirmed");
    expect(view.lines).toEqual([
      "Staff check every payment. If yours doesn't match, we'll message you.",
    ]);
    expect(view.totalLabel).toBe("Total paid");
    expect(view.total).toBe(formatPeso(1000));
    expect(view.code).toBe("K7MQ-3XPT");
    expect(view.storedCode).toBe("K7MQ3XPT");
  });

  it("names the day from the first run, and the courts by name (AC-3)", () => {
    const view = lookup({});
    expect(view.heading).toBe("Fri 30 Oct");
    expect(view.courts).toEqual([
      { id: 1, name: "Court 1" },
      { id: 2, name: "Court 2" },
    ]);
  });

  it("shows the contact masked, and Sent in place of any reference (AC-4, AC-18)", () => {
    const view = lookup({});
    expect(view.customer).toEqual([
      { term: "Name", value: "Ana" },
      { term: "Mobile", value: "•••• 4567" },
      { term: "Email", value: "a•••@example.com" },
    ]);
    expect(view.payment.map((fact) => fact.term)).toEqual(["Method", "Sent"]);
    expect(JSON.stringify(view)).not.toContain("Reference");
  });

  it("drops a purged phone or email line (AC-4)", () => {
    const view = lookup({ customer: { firstName: "Ana", phoneLast4: null, emailMasked: null } });
    expect(view.customer).toEqual([{ term: "Name", value: "Ana" }]);
  });

  it("reads Cancelled with the reason's plain line and Total (AC-5)", () => {
    const view = lookup({ view: "cancelled", reason: "amount_mismatch" });
    expect(view.word).toBe("Cancelled");
    expect(view.title).toBe("Booking cancelled");
    expect(view.lines).toEqual(["The amount we received didn't match the amount due."]);
    expect(view.totalLabel).toBe("Total");
  });

  it("adds the refund line under the status line (AC-6)", () => {
    expect(
      lookup({ view: "cancelled", reason: "venue_issue", refund: { status: "owed", amount: 1000 } })
        .lines,
    ).toEqual(["We had to close the court.", `Refund on its way: ${formatPeso(1000)}`]);
    expect(
      lookup({
        view: "cancelled",
        reason: "player_asked",
        refund: { status: "refunded", amount: 800, refundedAt: "2026-10-31T02:00:00Z" },
      }).lines[1],
    ).toBe(`Refunded ${formatPeso(800)} on Sat 31 Oct`);
  });

  it("reads Not booked for a payment that arrived after the slots went (AC-7)", () => {
    const view = lookup({ view: "not_booked", refund: { status: "owed", amount: 1000 } });
    expect(view.word).toBe("Not booked");
    expect(view.title).toBe("Not booked");
    expect(view.lines[0]).toBe("Your payment arrived after your slots were taken.");
    expect(view.totalLabel).toBe("Total");
    expect(view.runs).toHaveLength(2);
  });
});

describe("the lookup's receipt view, at the edges", () => {
  it("falls back to the general line when a cancel names no reason (AC-5)", () => {
    expect(lookup({ view: "cancelled", reason: null }).lines).toEqual([
      "Message us if you have any questions.",
    ]);
  });

  it("names a court once when the booking holds it twice (AC-3)", () => {
    const view = lookup({
      runs: [
        { ...base.runs[0], courtId: 1, courtName: "Court 1" },
        { ...base.runs[1], courtId: 1, courtName: "Court 1" },
      ],
    });
    expect(view.courts).toEqual([{ id: 1, name: "Court 1" }]);
    expect(view.runs).toHaveLength(2);
  });

  it("carries no court names or contact into the runs it hands the card (AC-18)", () => {
    expect(Object.keys(lookup({}).runs[0]).sort()).toEqual([
      "amount",
      "courtId",
      "endsAt",
      "startsAt",
    ]);
  });

  it("reads the Sent time at the venue, whatever the device's timezone (AC-3)", () => {
    const original = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      const sent = lookup({}).payment.find((fact) => fact.term === "Sent")?.value;
      // 09:05 UTC; read on the device's own clock it would say 9:05.
      expect(sent).toBe("Fri, Oct 30, 5:05 PM");
    } finally {
      process.env.TZ = original;
    }
  });
});

describe("the checkout's receipt view (AC-16)", () => {
  const receipt: BookingReceipt = {
    code: "K7MQ3XPT",
    status: "pending_check",
    amount: 750,
    runs: [
      { courtId: 2, startsAt: manila(DAY, "18:00"), endsAt: manila(DAY, "19:00"), amount: 250 },
      { courtId: 1, startsAt: manila(DAY, "21:00"), endsAt: manila(DAY, "23:00"), amount: 500 },
    ],
    customer: { name: "Ana Reyes", phone: "+639171234567", email: "ana@example.com" },
    payment: { referenceLast4: "1234", submittedAt: manila(DAY, "17:05") },
    retaken: false,
  };
  const courts = [
    { id: 1, name: "Court 1" },
    { id: 2, name: "Court 2" },
  ];
  const checkout = (overrides: Partial<BookingReceipt> = {}) =>
    buildReceiptView({
      source: "checkout",
      receipt: { ...receipt, ...overrides },
      heading: "Fri 30 Oct",
      courts,
    });

  it("keeps the player's own contact in full", () => {
    expect(checkout().customer).toEqual([
      { term: "Name", value: "Ana Reyes" },
      { term: "Mobile", value: "+639171234567" },
      { term: "Email", value: "ana@example.com" },
    ]);
  });

  it("reads Confirmed with Total paid, whatever the booking's status says", () => {
    const view = checkout({ status: "pending_check" });
    expect(view.source).toBe("checkout");
    expect(view.word).toBe("Confirmed");
    expect(view.title).toBe("Booking confirmed");
    expect(view.lines).toEqual([
      "Staff check every payment. If yours doesn't match, we'll message you.",
    ]);
    expect(view.totalLabel).toBe("Total paid");
    expect(view.total).toBe(formatPeso(750));
  });

  it("masks the reference to its last 4 and names the proof and submitted time", () => {
    expect(checkout().payment.map((fact) => fact.term)).toEqual([
      "Method",
      "Reference",
      "Proof",
      "Submitted",
    ]);
    expect(checkout().payment[1]).toEqual({ term: "Reference", value: "•••• 1234" });
  });

  it("carries the stored code for Track this booking, and the grouped one to read (AC-11)", () => {
    expect(checkout().storedCode).toBe("K7MQ3XPT");
    expect(checkout().code).toBe("K7MQ-3XPT");
  });

  it("drops a contact line the player left empty", () => {
    expect(checkout({ customer: { name: "Ana", phone: null, email: null } }).customer).toEqual([
      { term: "Name", value: "Ana" },
    ]);
  });
});
