import { describe, expect, it } from "vitest";

import {
  cancelInputSchema,
  decisionAnswerSchema,
  findBookingSchema,
  rejectInputSchema,
  settleInputSchema,
} from "./schemas";

/** Spec 0016: what every staff check action accepts before anything reaches Postgres. */

const ref = { bookingId: 7, version: 3 };

describe("findBookingSchema (AC-3)", () => {
  it("hands on the stored form of a valid code", () => {
    expect(findBookingSchema.parse({ code: "k7mq-3xpt" })).toEqual({ code: "K7MQ3XPT" });
  });

  it("refuses a partial code with the example message", () => {
    const result = findBookingSchema.safeParse({ code: "K7MQ" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "A code is 8 letters and numbers, like K7MQ-3XPT.",
    );
  });
});

describe("rejectInputSchema and cancelInputSchema (AC-8, AC-10)", () => {
  it("takes a reason from its own list only", () => {
    expect(
      rejectInputSchema.safeParse({ ...ref, reason: "amount_mismatch", refundOwed: true }).success,
    ).toBe(true);
    expect(
      rejectInputSchema.safeParse({ ...ref, reason: "player_asked", refundOwed: false }).success,
    ).toBe(false);
    expect(
      cancelInputSchema.safeParse({ ...ref, reason: "venue_issue", refundOwed: true }).success,
    ).toBe(true);
    expect(
      cancelInputSchema.safeParse({ ...ref, reason: "no_payment", refundOwed: true }).success,
    ).toBe(false);
  });

  it("needs a note for Other, and trims a blank one to none", () => {
    const missing = rejectInputSchema.safeParse({
      ...ref,
      reason: "other",
      note: "   ",
      refundOwed: false,
    });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0].path).toEqual(["note"]);

    const parsed = cancelInputSchema.parse({
      ...ref,
      reason: "player_asked",
      note: "  ",
      refundOwed: false,
    });
    expect(parsed.note).toBeUndefined();
  });

  it("keeps a note to 200 characters", () => {
    const result = rejectInputSchema.safeParse({
      ...ref,
      reason: "other",
      note: "x".repeat(201),
      refundOwed: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("settleInputSchema (AC-12)", () => {
  it("takes a refund of more than 0 and up to 99,999.99, in centavos at most", () => {
    const ok = (amount: number) =>
      settleInputSchema.safeParse({ ...ref, outcome: "refunded", amount }).success;
    expect(ok(500)).toBe(true);
    expect(ok(10.1)).toBe(true);
    expect(ok(99_999.99)).toBe(true);
    expect(ok(0)).toBe(false);
    expect(ok(100_000)).toBe(false);
    expect(ok(10.123)).toBe(false);
  });

  it("needs a note for No refund needed", () => {
    expect(settleInputSchema.safeParse({ ...ref, outcome: "not_owed", note: " " }).success).toBe(
      false,
    );
    expect(
      settleInputSchema.safeParse({ ...ref, outcome: "not_owed", note: "No money arrived" })
        .success,
    ).toBe(true);
  });
});

describe("decisionAnswerSchema", () => {
  it("reads a success and every refusal the functions answer with", () => {
    expect(
      decisionAnswerSchema.safeParse({
        ok: true,
        version: 4,
        previous_status: "pending_check",
        submitted_at: "2026-10-30T08:00:00Z",
        decided_at: "2026-10-30T09:00:00Z",
      }).success,
    ).toBe(true);
    for (const reason of ["stale", "wrong_state", "forbidden", "not_found", "invalid"]) {
      expect(decisionAnswerSchema.safeParse({ ok: false, reason }).success).toBe(true);
    }
    expect(decisionAnswerSchema.safeParse({ ok: false, reason: "nope" }).success).toBe(false);
  });
});
