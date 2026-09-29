import { CalendarXIcon } from "@phosphor-icons/react/ssr";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./empty-state";

/**
 * Spec 0003, the empty state: it says what and why, with an optional action.
 */
describe("EmptyState", () => {
  it("shows its title and body, with the icon hidden from readers", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, { icon: CalendarXIcon, title: "No courts yet", body: "Add one." }),
    );
    expect(html).toContain("No courts yet");
    expect(html).toContain("Add one.");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("renders an action only when given one", () => {
    const withAction = renderToStaticMarkup(
      createElement(EmptyState, {
        icon: CalendarXIcon,
        title: "t",
        body: "b",
        action: createElement("a", { href: "/staff/settings" }, "Open settings"),
      }),
    );
    expect(withAction).toContain('href="/staff/settings"');
    const without = renderToStaticMarkup(
      createElement(EmptyState, { icon: CalendarXIcon, title: "t", body: "b" }),
    );
    expect(without).not.toContain("<a");
  });
});
