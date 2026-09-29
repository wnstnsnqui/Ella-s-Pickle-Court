import { describe, expect, it } from "vitest";

import robots from "./robots";
import sitemap from "./sitemap";

/** Spec 0013, AC-22: the four public pages listed and allowed, the rest disallowed. */

describe("sitemap and robots", () => {
  it("lists the four public pages", () => {
    expect(sitemap().map((entry) => new URL(entry.url).pathname)).toEqual([
      "/",
      "/schedule",
      "/privacy",
      "/terms",
    ]);
  });

  it("allows the public pages, disallows the private ones, and points at the sitemap", () => {
    const { rules, sitemap: map } = robots();
    expect(rules).toMatchObject({
      userAgent: "*",
      allow: ["/", "/schedule", "/privacy", "/terms"],
      disallow: ["/staff", "/sign-in", "/sign-up", "/reset", "/design", "/api"],
    });
    expect(String(map)).toMatch(/\/sitemap\.xml$/);
  });
});
