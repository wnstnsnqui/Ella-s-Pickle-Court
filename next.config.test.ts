import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

/**
 * Spec 0013, AC-21: the board moved to `/schedule`, so an old shared
 * `/?date=` link answers a permanent redirect there, the query carried along
 * by Next unchanged. `/` with no `date` stays the landing page.
 */

describe("the old board link redirect (AC-21)", () => {
  it("sends / with a date query to /schedule, permanently", async () => {
    const redirects = await nextConfig.redirects!();
    const fromRoot = redirects.filter((rule) => rule.source === "/");
    expect(fromRoot).toEqual([
      {
        source: "/",
        has: [{ type: "query", key: "date" }],
        destination: "/schedule",
        permanent: true,
      },
    ]);
  });

  it("only fires when a date query is present, never on a bare /", async () => {
    const redirects = await nextConfig.redirects!();
    const unconditional = redirects.filter((rule) => rule.source === "/" && !rule.has?.length);
    expect(unconditional).toEqual([]);
  });
});
