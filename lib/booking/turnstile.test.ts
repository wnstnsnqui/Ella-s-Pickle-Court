import { describe, expect, it } from "vitest";

import { siteverifyPasses } from "./turnstile";

/**
 * Spec 0015, AC-19: a hold goes on only when Siteverify says `success`, with
 * the `booking_hold` action and an allowed hostname. Cloudflare's testing
 * secret reports no action, so it passes outside production only.
 */

const expected = { action: "booking_hold", hostnames: ["picklecourt.ph"], production: true };
const real = { success: true, action: "booking_hold", hostname: "picklecourt.ph" };

describe("siteverifyPasses", () => {
  it("passes a real answer with the right action and hostname", () => {
    expect(siteverifyPasses(real, expected)).toBe(true);
  });

  it.each([
    ["not a success", { ...real, success: false }],
    ["a truthy success that is not true", { ...real, success: "true" }],
    ["another action", { ...real, action: "signup" }],
    ["no action", { success: true, hostname: "picklecourt.ph" }],
    ["another hostname", { ...real, hostname: "evil.example" }],
    ["no hostname", { success: true, action: "booking_hold" }],
  ])("refuses %s", (_label, answer) => {
    expect(siteverifyPasses(answer, expected)).toBe(false);
  });

  const testing = {
    success: true,
    hostname: "example.com",
    metadata: { result_with_testing_key: true },
  };

  it("lets a testing key answer through outside production, hostname still checked", () => {
    const dev = { ...expected, hostnames: ["example.com"], production: false };
    expect(siteverifyPasses(testing, dev)).toBe(true);
    expect(siteverifyPasses(testing, { ...dev, hostnames: ["localhost"] })).toBe(false);
  });

  it("refuses a testing key answer in production", () => {
    expect(siteverifyPasses(testing, { ...expected, hostnames: ["example.com"] })).toBe(false);
  });
});
