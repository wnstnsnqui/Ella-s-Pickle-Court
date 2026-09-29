import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LandingHeader } from "./landing-header";

/**
 * Spec 0013: the landing header is the main navigation, pointing at the three
 * sections on the page, with one call to book.
 */
describe("LandingHeader", () => {
  it("is the page's main navigation", () => {
    expect(renderToStaticMarkup(createElement(LandingHeader))).toContain('aria-label="Main"');
  });

  it("links the sections on the page", () => {
    const html = renderToStaticMarkup(createElement(LandingHeader));
    for (const [href, label] of [
      ["#offers", "Offers"],
      ["#book", "Book"],
      ["#visit", "Visit"],
    ]) {
      expect(html).toMatch(new RegExp(`<a[^>]*href="${href}"[^>]*>${label}</a>`));
    }
  });

  it("calls to book a court, pointing at the booking section", () => {
    const html = renderToStaticMarkup(createElement(LandingHeader));
    expect(html).toMatch(/<a[^>]*href="#book"[^>]*>Book a court/);
  });
});
