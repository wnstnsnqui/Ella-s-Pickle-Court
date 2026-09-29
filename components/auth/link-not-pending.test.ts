import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { STAFF_ONLY_LINE } from "@/lib/auth/constants";

import { LinkNotPending } from "./link-not-pending";

/**
 * Spec 0004 (revised): an invite or reset link that is no longer pending says
 * so, explains why by default, says the app is for staff only, and offers the
 * way to sign in instead.
 */
describe("LinkNotPending", () => {
  it("shows the title, the default reason, the staff only line and the sign in link", () => {
    const html = renderToStaticMarkup(
      createElement(LinkNotPending, { title: "This link has expired" }),
    );
    expect(html).toContain("This link has expired");
    expect(html).toContain("more than seven days old. Ask Ella for a new one.");
    expect(html).toContain(STAFF_ONLY_LINE);
    expect(html).toMatch(/<a[^>]*href="\/sign-in"[^>]*>I already have an account<\/a>/);
  });

  it("uses a given reason in place of the default", () => {
    const html = renderToStaticMarkup(
      createElement(LinkNotPending, { title: "t", body: "This reset link was already used." }),
    );
    expect(html).toContain("This reset link was already used.");
    expect(html).not.toContain("seven days old");
  });
});
