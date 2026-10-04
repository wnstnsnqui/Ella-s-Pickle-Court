import { describe, expect, it } from "vitest";

import { CANCEL_REASON_VALUES, REJECT_REASON_VALUES } from "@/lib/online-checks/constants";

import { endedMessage, limitedMessage, LOOKUP_REASON_LINES, refundLine } from "./lookup";

/** Spec 0017, AC-5, AC-6, AC-9 and AC-10: the words the lookup prints. */
describe("the lookup's words", () => {
  it("has a plain line for every reason staff can pick, and no other (AC-5)", () => {
    expect(Object.keys(LOOKUP_REASON_LINES).sort()).toEqual(
      [...new Set([...REJECT_REASON_VALUES, ...CANCEL_REASON_VALUES])].sort(),
    );
  });

  it("rounds the wait up to whole minutes, never below one (AC-10)", () => {
    expect(limitedMessage(1)).toContain("Try again in 1 minute, or");
    expect(limitedMessage(60)).toContain("Try again in 1 minute, or");
    expect(limitedMessage(61)).toContain("Try again in 2 minutes, or");
    expect(limitedMessage(900)).toContain("Try again in 15 minutes, or");
  });

  it("names the venue day of the last run's start, so a run to midnight keeps its day (AC-9)", () => {
    // 10pm on Sat 31 Oct in Manila, ending at midnight on Sun 1 Nov.
    expect(endedMessage("2026-10-31T14:00:00Z")).toBe(
      "This booking ended on Sat 31 Oct. Message us if you need its receipt.",
    );
  });

  it("says a refund is owed or sent, and nothing otherwise (AC-6)", () => {
    expect(refundLine(null)).toBeNull();
    expect(refundLine({ status: "owed", amount: 1000 })).toBe("Refund on its way: ₱1,000");
    // 5pm UTC on Fri 30 Oct is 1am on Sat 31 Oct in Manila.
    expect(
      refundLine({ status: "refunded", amount: 1000, refundedAt: "2026-10-30T17:00:00Z" }),
    ).toBe("Refunded ₱1,000 on Sat 31 Oct");
  });
});
