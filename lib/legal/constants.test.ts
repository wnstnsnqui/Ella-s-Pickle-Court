import { describe, expect, it } from "vitest";

import { VENUE_ADDRESS as venueAddress } from "@/lib/venue";

import { PHONE_RETENTION_DAYS, PRIVACY_NOTICE_VERSION, VENUE_ADDRESS } from "./constants";

/**
 * Spec 0010, AC-4 and AC-12, and spec 0013, AC-19: the legal pages read the
 * venue's address from the one place the landing page does, the notice
 * version is a real calendar date, and phones are kept a positive whole
 * number of days.
 */
describe("legal constants", () => {
  it("prints the same address as the landing page", () => {
    expect(VENUE_ADDRESS).toBe(venueAddress);
  });

  it("versions the privacy notice with a real ISO calendar date", () => {
    expect(PRIVACY_NOTICE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${PRIVACY_NOTICE_VERSION}T00:00:00Z`).toISOString().slice(0, 10)).toBe(
      PRIVACY_NOTICE_VERSION,
    );
  });

  it("keeps a phone number a positive whole number of days", () => {
    expect(Number.isInteger(PHONE_RETENTION_DAYS)).toBe(true);
    expect(PHONE_RETENTION_DAYS).toBeGreaterThan(0);
  });
});
