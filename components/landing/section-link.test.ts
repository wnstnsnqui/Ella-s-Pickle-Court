import { describe, expect, it } from "vitest";

import { sameHashTarget } from "./section-link";

/** Where the reader is, the way `window.location` would say it. */
function at(url: string) {
  const { href, pathname, search, hash } = new URL(url);
  return { href, pathname, search, hash };
}

/**
 * Next scrolls to a fragment only when the hash changes, so a second click on
 * "Book a court" once the address already ends in `#book` went nowhere.
 */
describe("sameHashTarget", () => {
  it("takes over a click on the hash the address already has", () => {
    expect(sameHashTarget("/#book", at("http://x.test/#book"))).toBe("book");
    expect(sameHashTarget("#book", at("http://x.test/#book"))).toBe("book");
  });

  it("leaves a new hash to Link, which scrolls it itself", () => {
    expect(sameHashTarget("/#book", at("http://x.test/"))).toBeNull();
    expect(sameHashTarget("/#visit", at("http://x.test/#book"))).toBeNull();
  });

  it("leaves another page to Link", () => {
    expect(sameHashTarget("/#book", at("http://x.test/booking#book"))).toBeNull();
    expect(sameHashTarget("/#book", at("http://x.test/?day=2#book"))).toBeNull();
  });

  it("leaves a link with no hash alone", () => {
    expect(sameHashTarget("/schedule", at("http://x.test/schedule"))).toBeNull();
  });
});
