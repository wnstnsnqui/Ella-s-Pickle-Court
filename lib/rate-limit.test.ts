import { describe, expect, it } from "vitest";

import { SlidingWindow, clientAddress } from "./rate-limit";

/**
 * Spec 0006, AC-8: sixty in a minute pass and the sixty first is refused with a
 * Retry-After, addresses do not share a bucket, the window slides, and the key
 * map stays under its cap.
 */

const T0 = Date.parse("2026-09-14T10:00:00Z");

describe("SlidingWindow", () => {
  it("allows the limit and refuses the next with a Retry-After (AC-8)", () => {
    const window = new SlidingWindow({ limit: 60, windowMs: 60_000 });
    for (let i = 0; i < 60; i += 1) {
      expect(window.hit("a", T0 + i * 100)).toEqual({ allowed: true });
    }
    const refused = window.hit("a", T0 + 6_000);
    expect(refused.allowed).toBe(false);
    if (!refused.allowed) {
      // The oldest hit was at T0; it leaves the window at T0 + 60 s, 54 s from now.
      expect(refused.retryAfterSeconds).toBe(54);
    }
  });

  it("keeps one address's bucket away from another's (AC-8)", () => {
    const window = new SlidingWindow({ limit: 2, windowMs: 60_000 });
    window.hit("a", T0);
    window.hit("a", T0);
    expect(window.hit("a", T0).allowed).toBe(false);
    expect(window.hit("b", T0).allowed).toBe(true);
  });

  it("slides: a hit is allowed again once the oldest leaves the window", () => {
    const window = new SlidingWindow({ limit: 2, windowMs: 1_000 });
    window.hit("a", T0);
    window.hit("a", T0 + 500);
    expect(window.hit("a", T0 + 900).allowed).toBe(false);
    expect(window.hit("a", T0 + 1_001).allowed).toBe(true);
  });

  it("never answers a Retry-After under one second", () => {
    const window = new SlidingWindow({ limit: 1, windowMs: 1_000 });
    window.hit("a", T0);
    const refused = window.hit("a", T0 + 999);
    expect(refused).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it("sweeps keys with nothing left in the window", () => {
    const window = new SlidingWindow({ limit: 5, windowMs: 1_000, sweepEveryMs: 1_000 });
    window.hit("a", T0);
    window.hit("b", T0);
    expect(window.size).toBe(2);
    window.hit("c", T0 + 2_000);
    expect(window.size).toBe(1);
  });

  it("evicts the oldest inserted key past the cap", () => {
    const window = new SlidingWindow({ limit: 5, windowMs: 60_000, maxKeys: 3 });
    window.hit("a", T0);
    window.hit("b", T0);
    window.hit("c", T0);
    window.hit("d", T0);
    expect(window.size).toBe(3);
    // "a" was evicted, so it starts fresh; "b" is now the eldest.
    expect(window.hit("a", T0).allowed).toBe(true);
    expect(window.size).toBe(3);
  });
});

describe("clientAddress", () => {
  const headers = (map: Record<string, string>) => ({
    get: (name: string) => map[name.toLowerCase()] ?? null,
  });

  it("takes the first forwarded entry", () => {
    expect(clientAddress(headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe(
      "203.0.113.9",
    );
  });

  it("falls back to x-real-ip", () => {
    expect(clientAddress(headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("returns null with neither header, so the caller skips the limit (AC-8)", () => {
    expect(clientAddress(headers({}))).toBeNull();
    expect(clientAddress(headers({ "x-forwarded-for": " " }))).toBeNull();
  });
});
