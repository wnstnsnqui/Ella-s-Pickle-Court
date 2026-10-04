import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BookingReceipt } from "@/lib/booking/types";
import { formatPeso } from "@/lib/venue";

import { ReceiptStep, ReviewStep } from "./checkout-receipt";
import { manila } from "./test-fixture";

/**
 * Spec 0015, AC-11 and AC-14 (amendment 2026-10-02): Review in three cards and
 * the receipt the player keeps, which reads "Confirmed" whatever the
 * booking's status says.
 */

const DAY = "2026-10-30";
const courts = [
  { id: 1, name: "Court 1" },
  { id: 2, name: "Court 2" },
];

const receipt: BookingReceipt = {
  code: "K7MQ3XPT",
  // Staff still read "Payment not yet checked"; the player's chip never reads this.
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

describe("the receipt", () => {
  const html = renderToStaticMarkup(
    createElement(ReceiptStep, { receipt, heading: "Fri 30 Oct", courts }),
  );

  it("shows the code grouped, and Confirmed although the booking waits for its check", () => {
    expect(html).toContain("K7MQ-3XPT");
    expect(html).toContain("Confirmed");
    expect(html).not.toContain("pending_check");
    expect(html).toContain("Staff check every payment. If yours doesn&#x27;t match");
  });

  it("offers to save the receipt as an image or a PDF (spec 0017, AC-16)", () => {
    expect(html).toContain("Save as image");
    expect(html).toContain("Save as PDF");
  });

  it("links Track this booking to /booking in a new tab, the code in the fragment (spec 0017, AC-11)", () => {
    expect(html).toMatch(
      /<a[^>]*href="\/booking#K7MQ3XPT"[^>]*target="_blank"[^>]*>Track this booking/,
    );
  });

  it("keeps its own contact in full, and the receipt is what prints (spec 0017, AC-14, AC-16)", () => {
    expect(html).toContain("Ana Reyes");
    expect(html).toContain("+639171234567");
    expect(html).toContain("ana@example.com");
    expect(html).toContain("data-receipt");
  });

  it("lists each run under Selected courts and slots, with the fee line and total", () => {
    expect(html).toContain("Selected courts and slots");
    expect(html).toContain("Fri 30 Oct · 9pm to 11pm");
    expect(html).toContain("2 hr");
    expect(html).toContain("Court hours (3)");
    expect(html.indexOf("Court 1")).toBeLessThan(html.indexOf("Court 2"));
  });

  it("masks the reference and shows the total paid", () => {
    expect(html).toContain("•••• 1234");
    expect(html).toContain("Screenshot received");
    expect(html).toContain("Total paid");
    expect(html).toContain(formatPeso(750));
  });
});

describe("review", () => {
  const html = renderToStaticMarkup(
    createElement(ReviewStep, {
      order: { heading: "Fri 30 Oct", courts, runs: receipt.runs, amount: 750 },
      details: { name: "Ana Reyes", phone: "+639171234567", email: "ana@example.com" },
      digits: "1234",
      proof: { status: "empty" },
      onEditDetails: () => {},
      onEditPayment: () => {},
    }),
  );

  it("groups the order, the details and the payment, two of them with Edit", () => {
    for (const label of ["Booking details", "Your details", "Payment"]) {
      expect(html).toContain(label);
    }
    expect(html.match(/>Edit</g)).toHaveLength(2);
    expect(html).toContain("GCash transfer");
    expect(html).toContain("•••• 1234");
  });
});
