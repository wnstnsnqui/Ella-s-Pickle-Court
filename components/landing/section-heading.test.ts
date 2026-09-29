import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SectionHeading } from "./section-heading";

/**
 * Spec 0013: each landing section opens with an eyebrow, a second level
 * heading whose id the section's links and `aria-labelledby` point at, and an
 * optional lead line.
 */
describe("SectionHeading", () => {
  it("renders the eyebrow and an h2 carrying the id", () => {
    const html = renderToStaticMarkup(
      createElement(SectionHeading, { id: "offers-title", eyebrow: "Offers", title: "Play more" }),
    );
    expect(html).toContain(">Offers</p>");
    expect(html).toMatch(/<h2 id="offers-title"[^>]*>Play more<\/h2>/);
  });

  it("adds the lead line only when given one", () => {
    const withLead = renderToStaticMarkup(
      createElement(SectionHeading, { id: "a", eyebrow: "e", title: "t" }, "Courts by the hour."),
    );
    expect(withLead).toContain("Courts by the hour.");
    const without = renderToStaticMarkup(
      createElement(SectionHeading, { id: "a", eyebrow: "e", title: "t" }),
    );
    expect(without.match(/<p/g)).toHaveLength(1);
  });
});
