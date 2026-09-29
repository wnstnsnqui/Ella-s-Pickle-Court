import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ErrorState } from "./error-state";

/**
 * Spec 0003, the error state: an alert that offers Try again only when there
 * is something to retry.
 */
describe("ErrorState", () => {
  it("is an alert that says the schedule did not load, with the reason", () => {
    const html = renderToStaticMarkup(createElement(ErrorState, { message: "Timed out." }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("The schedule did not load");
    expect(html).toContain("Timed out.");
  });

  it("offers Try again only when there is a retry to run", () => {
    expect(
      renderToStaticMarkup(createElement(ErrorState, { message: "x", onRetry: () => {} })),
    ).toContain("Try again");
    expect(renderToStaticMarkup(createElement(ErrorState, { message: "x" }))).not.toContain(
      "Try again",
    );
  });
});
