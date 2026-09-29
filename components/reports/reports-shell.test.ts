import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Spec 0008: the page's shell names the page in its one heading, links back to
 * the staff schedule, and renders what it is given. The app shell and the
 * staff menu have their own tests and are stood in for here.
 */
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, toolbar }: { children: React.ReactNode; toolbar?: React.ReactNode }) =>
    createElement("div", { "data-shell": true }, toolbar, children),
}));
vi.mock("@/components/staff-menu", () => ({ StaffMenu: () => null }));

const { ReportsShell } = await import("./reports-shell");

describe("ReportsShell", () => {
  it("names the page, links back to the schedule, and renders its content", () => {
    const html = renderToStaticMarkup(
      createElement(ReportsShell, null, createElement("p", null, "page content")),
    );
    expect(html).toMatch(/<h1[^>]*>Reports<\/h1>/);
    expect(html).toMatch(/<a[^>]*href="\/staff"[^>]*>.*Schedule<\/a>/);
    expect(html).toContain("<p>page content</p>");
  });
});
