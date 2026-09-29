import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import LandingError from "./error";

/**
 * Spec 0013, AC-26: a crash anywhere in the landing page lands on its own
 * quiet boundary, the top bar, the hero without its board and the message
 * card, and never shows the error's message, code or digest.
 */

describe("the landing error boundary", () => {
  it("shows the hero and the message card and nothing of the error", () => {
    const error = Object.assign(new Error("relation court does not exist"), {
      digest: "3141592653",
    });
    const html = renderToStaticMarkup(createElement(LandingError, { error, retry: () => {} }));
    expect(html).toContain("Your court is waiting.");
    expect(html).toContain("Book by message");
    expect(html).toContain("Try again");
    expect(html).not.toContain("As of");
    expect(html).not.toMatch(/relation|3141592653|digest|reference|went wrong|error/i);
  });
});
