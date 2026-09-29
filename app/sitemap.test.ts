import { describe, expect, it } from "vitest";

import sitemap, { PUBLIC_PATHS } from "./sitemap";

/**
 * Spec 0013, AC-22: the sitemap lists only the four public pages, as absolute
 * addresses, and never a staff screen, sign in or the API.
 */
describe("sitemap", () => {
  it("lists the four public pages as absolute addresses", () => {
    const urls = sitemap().map((entry) => new URL(entry.url));
    expect(urls.map((url) => url.pathname)).toEqual([...PUBLIC_PATHS]);
    for (const url of urls) expect(url.protocol).toMatch(/^https?:$/);
  });

  it("leaves out the staff screens, sign in and the API", () => {
    const paths = sitemap().map((entry) => new URL(entry.url).pathname);
    for (const hidden of ["/staff", "/sign-in", "/api/schedule"]) {
      expect(paths.some((path) => path.startsWith(hidden))).toBe(false);
    }
  });
});
