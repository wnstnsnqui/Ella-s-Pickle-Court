import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { manila } from "@/components/landing/test-fixture";
import type { BookingLookup } from "@/lib/booking/types";
import { VENUE_ADDRESS } from "@/lib/venue";

import { ReceiptCard } from "./receipt-card";
import { buildReceiptView } from "./receipt-view";

/**
 * Spec 0017, AC-3, AC-5 and AC-14: the lookup's receipt puts the status first,
 * masks the contact, and carries the venue for the printed page.
 */

const DAY = "2026-10-30";

const lookup: BookingLookup = {
  view: "cancelled",
  code: "K7MQ3XPT",
  reason: "invalid_proof",
  refund: { status: "owed", amount: 250 },
  customer: { firstName: "Ana", phoneLast4: "4567", emailMasked: "a•••@example.com" },
  amount: 250,
  submittedAt: manila(DAY, "17:05"),
  runs: [
    {
      courtId: 1,
      courtName: "Court 1",
      startsAt: manila(DAY, "18:00"),
      endsAt: manila(DAY, "19:00"),
      amount: 250,
    },
  ],
};

const html = renderToStaticMarkup(
  createElement(ReceiptCard, { view: buildReceiptView({ source: "lookup", lookup }) }),
);

describe("the lookup's receipt card", () => {
  it("opens with the badge and the title, before the code (AC-3, AC-5)", () => {
    expect(html.indexOf("Cancelled")).toBeLessThan(html.indexOf("Your booking code"));
    expect(html).toContain("Booking cancelled");
    expect(html).toContain("The screenshot didn&#x27;t show a completed payment.");
    expect(html).toContain("Refund on its way: ₱250");
  });

  it("shows the masked contact and no reference (AC-4, AC-18)", () => {
    expect(html).toContain("•••• 4567");
    expect(html).toContain("a•••@example.com");
    expect(html).not.toContain("Reference");
    expect(html).toContain(">Total<");
  });

  it("carries the venue's address for the printed page, and marks itself as the receipt (AC-14)", () => {
    expect(html).toContain("data-receipt");
    expect(html).toContain(VENUE_ADDRESS);
  });
});
