import { describe, expect, it } from "vitest";

import robots from "../robots";
import { PUBLIC_PATHS } from "../sitemap";

import { dynamic, metadata } from "./page";

/**
 * Spec 0017, AC-1: `/booking` is kept out of search by its own noindex, not
 * listed in the sitemap, and never disallowed, so a crawler can read the noindex.
 */
describe("/booking", () => {
  it("asks not to be indexed or followed, under its own title", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.title).toBe("Find your booking");
  });

  it("renders per request", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("is neither in the sitemap nor disallowed in robots.txt", () => {
    expect(PUBLIC_PATHS).not.toContain("/booking");
    const rules = robots().rules;
    const disallow = (Array.isArray(rules) ? rules : [rules]).flatMap((rule) =>
      Array.isArray(rule.disallow) ? rule.disallow : rule.disallow ? [rule.disallow] : [],
    );
    expect(disallow.some((path) => "/booking".startsWith(path))).toBe(false);
  });
});
