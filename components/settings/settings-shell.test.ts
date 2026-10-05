import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Spec 0007: the page's shell names the page in its one heading, links back to
 * the staff board, and renders what it is given. The app shell and the
 * staff menu have their own tests and are stood in for here.
 */
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-shell": true }, children),
}));
vi.mock("@/components/staff-menu", () => ({ StaffMenu: () => null }));

const { SettingsShell } = await import("./settings-shell");

describe("SettingsShell", () => {
  it("names the page, links back to the schedule, and renders its content", () => {
    const html = renderToStaticMarkup(
      createElement(SettingsShell, null, createElement("p", null, "page content")),
    );
    expect(html).toMatch(/<h1[^>]*>Settings<\/h1>/);
    expect(html).toMatch(/<a[^>]*href="\/staff"[^>]*>.*Back to the board<\/a>/);
    expect(html).toContain("<p>page content</p>");
  });
});
