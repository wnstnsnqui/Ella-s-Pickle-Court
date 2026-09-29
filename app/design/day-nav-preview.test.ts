import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DayNavPreview } from "./day-nav-preview";

/**
 * Spec 0014: `DayNav` is controlled by its board, so the design gallery owns a
 * day of its own and starts on the one it is given, at rest.
 */
describe("DayNavPreview", () => {
  it("starts on the day it is given, with nothing pending", () => {
    const html = renderToStaticMarkup(
      createElement(DayNavPreview, {
        date: "2026-10-02",
        timezone: "Asia/Manila",
        horizonDays: 14,
      }),
    );
    expect(html).toContain("Fri, Oct 2");
    expect(html).not.toContain('aria-busy="true"');
  });
});
