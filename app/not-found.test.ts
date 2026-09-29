import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import NotFound from "./not-found";

/**
 * The not found page: says so plainly, and leads back to the board at
 * `/schedule`, where it lives since spec 0013.
 */
describe("NotFound", () => {
  it("says the page was not found and links back to today's board", () => {
    const html = renderToStaticMarkup(createElement(NotFound));
    expect(html).toContain("Page not found");
    expect(html).toMatch(/<a[^>]*href="\/schedule"[^>]*>Back to today<\/a>/);
  });
});
