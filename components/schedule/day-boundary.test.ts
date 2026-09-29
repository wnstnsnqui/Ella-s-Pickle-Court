import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DayBoundary } from "./day-boundary";

/**
 * Spec 0014, AC-7: the boundary adds nothing to the page, it only keys its
 * children on the day on screen so they start fresh when a new day lands.
 * The remount itself is a browser behaviour, proven by /check verify.
 */
describe("DayBoundary", () => {
  it("renders its children with no wrapper element of its own", () => {
    const html = renderToStaticMarkup(
      createElement(
        DayBoundary,
        { date: "2026-09-29" } as ComponentProps<typeof DayBoundary>,
        createElement("p", null, "board"),
      ),
    );
    expect(html).toBe("<p>board</p>");
  });
});
