import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ThemeToggle } from "./theme-toggle";

/**
 * Spec 0003, AC-1 and the accessibility rules in docs/design.md.
 *
 * Rendered to static HTML: the server paints this button with the cookie's
 * theme already applied, so what the first paint says is what a screen reader
 * announces before any script runs. Click behaviour needs a DOM and is covered by
 * `/check verify` in the browser.
 */

function render(initial: "system" | "light" | "dark") {
  return renderToStaticMarkup(createElement(ThemeToggle, { initial }));
}

describe("ThemeToggle", () => {
  it("renders one real button, not a link or a div (AC-1)", () => {
    const html = render("system");
    expect(html).toMatch(/<button[^>]*type="button"/);
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("announces the current theme and the next one when following the device", () => {
    const html = render("system");
    expect(html).toContain('aria-label="Theme: Follows your device. Switch to light"');
    expect(html).toContain('title="Theme: Follows your device"');
  });

  it("walks light to dark", () => {
    expect(render("light")).toContain('aria-label="Theme: Light. Switch to dark"');
  });

  it("walks dark back to following the device", () => {
    expect(render("dark")).toContain('aria-label="Theme: Dark. Switch to follows your device"');
  });

  it("hides the icon from assistive tech so the label is the only name", () => {
    const html = render("system");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html.match(/<svg/g)).toHaveLength(1);
  });

  it.each(["system", "light", "dark"] as const)("shows a different icon for %s", (theme) => {
    // lucide stamps the icon name on the svg as a class
    const html = render(theme);
    const expected = { system: "lucide-monitor", light: "lucide-sun", dark: "lucide-moon" }[theme];
    expect(html).toContain(expected);
  });
});
