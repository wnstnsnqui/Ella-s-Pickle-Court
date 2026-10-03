import { describe, expect, it } from "vitest";

import { normalizeBookingCode, reasonLabel, refundDefault, timeTag } from "./constants";

/** Spec 0016, AC-3, AC-8, AC-10 and AC-16: the pure rules behind the list and the steps. */

describe("normalizeBookingCode (AC-3)", () => {
  it("takes the code with or without the dash, in any case", () => {
    expect(normalizeBookingCode("K7MQ-3XPT")).toBe("K7MQ3XPT");
    expect(normalizeBookingCode("k7mq3xpt")).toBe("K7MQ3XPT");
    expect(normalizeBookingCode(" k7mq - 3xpt ")).toBe("K7MQ3XPT");
  });

  it("refuses anything but exactly 8 alphabet characters, so nothing partial is searched", () => {
    expect(normalizeBookingCode("K7MQ")).toBeNull();
    expect(normalizeBookingCode("K7MQ3XPTA")).toBeNull();
    // 0, 1, I, L and O are not in the alphabet.
    expect(normalizeBookingCode("K7MQ3XP0")).toBeNull();
    expect(normalizeBookingCode("K7MQ3XPI")).toBeNull();
    expect(normalizeBookingCode("K7MQ3XPL")).toBeNull();
    expect(normalizeBookingCode("")).toBeNull();
  });
});

describe("refundDefault (AC-8, AC-10)", () => {
  it("ticks the box for the two turn down reasons that mean money arrived", () => {
    expect(refundDefault("turn_down", "amount_mismatch", "pending_check")).toBe(true);
    expect(refundDefault("turn_down", "reference_mismatch", "confirmed")).toBe(true);
    expect(refundDefault("turn_down", "no_payment", "pending_check")).toBe(false);
    expect(refundDefault("turn_down", "invalid_proof", "pending_check")).toBe(false);
    expect(refundDefault("turn_down", "other", "confirmed")).toBe(false);
    expect(refundDefault("turn_down", null, "confirmed")).toBe(false);
  });

  it("ticks it for a cancel of a confirmed booking, not of an unchecked one", () => {
    expect(refundDefault("cancel", "player_asked", "confirmed")).toBe(true);
    expect(refundDefault("cancel", "player_asked", "pending_check")).toBe(false);
  });
});

describe("timeTag (AC-16)", () => {
  const now = Date.parse("2026-10-30T10:00:00Z");

  it("reads Starts in N min in the hour before the first active slot", () => {
    expect(timeTag("2026-10-30T10:25:00Z", "2026-10-30T08:00:00Z", now)).toBe("Starts in 25 min");
    expect(timeTag("2026-10-30T11:00:00Z", "2026-10-30T08:00:00Z", now)).toBe("Starts in 60 min");
  });

  it("reads Started, not checked once the first slot has begun", () => {
    expect(timeTag("2026-10-30T09:50:00Z", "2026-10-30T08:00:00Z", now)).toBe(
      "Started, not checked",
    );
    expect(timeTag("2026-10-30T10:00:00Z", null, now)).toBe("Started, not checked");
  });

  it("reads how long ago it was sent otherwise", () => {
    expect(timeTag("2026-10-31T10:00:00Z", "2026-10-30T08:00:00Z", now)).toBe("Sent 2 hr ago");
    expect(timeTag("2026-10-31T10:00:00Z", "2026-10-30T09:45:00Z", now)).toBe("Sent 15 min ago");
    expect(timeTag(null, "2026-10-30T09:59:30Z", now)).toBe("Sent just now");
    expect(timeTag(null, "2026-10-27T09:00:00Z", now)).toBe("Sent 3 days ago");
    expect(timeTag(null, null, now)).toBeNull();
  });
});

describe("reasonLabel", () => {
  it("names a reason from either list", () => {
    expect(reasonLabel("amount_mismatch")).toBe("Amount doesn't match");
    expect(reasonLabel("venue_issue")).toBe("Venue issue (court closed, weather)");
    expect(reasonLabel("other")).toBe("Other");
  });
});
