import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { formatPeso } from "@/lib/venue";

import { PaymentStep } from "./checkout-payment";

/**
 * Spec 0015, AC-8 (second amendment 2026-10-02): Payment asks for the money
 * and the proof, and keeps the booking code back until the receipt.
 */
describe("the payment step", () => {
  const html = renderToStaticMarkup(
    createElement(PaymentStep, {
      held: {
        code: "K7MQ3XPT",
        holdExpiresAt: "2026-10-30T09:05:00Z",
        serverNow: "2026-10-30T09:00:00Z",
        amount: 750,
        runs: [],
        upload: { signedUrl: "https://example.test/upload" },
        receivedAt: 0,
      },
      digits: "",
      onDigits: () => {},
      proof: { status: "empty" },
      fieldError: null,
      onChoose: () => {},
      onRetry: () => {},
    }),
  );

  it("shows the amount to send", () => {
    expect(html).toContain(`Send exactly ${formatPeso(750)}`);
  });

  it("offers to save the QR, for a player paying on the same phone", () => {
    expect(html).toContain("Save QR code");
  });

  it("does not show the booking code", () => {
    expect(html).not.toContain("K7MQ");
    expect(html).not.toContain("booking code");
  });
});
