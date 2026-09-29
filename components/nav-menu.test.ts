import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NavMenu } from "./nav-menu";

/**
 * The small screen menu: an icon only trigger with a spoken name, closed at
 * first, so its links are not in the page until it opens.
 */
describe("NavMenu", () => {
  it("renders a closed trigger named Menu, with its links not yet in the page", () => {
    const html = renderToStaticMarkup(
      createElement(NavMenu, null, createElement("a", { href: "/staff/reports" }, "Reports")),
    );
    expect(html).toMatch(/<button[^>]*aria-label="Menu"/);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("/staff/reports");
  });
});
