import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Spec 0006, AC-12 and spec 0014, AC-11: while `/schedule` renders on a hard
 * load, the board's shape shows with a status a screen reader announces. It
 * lives beside the board, so it never shows while `/` loads.
 */
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, toolbar }: { children: React.ReactNode; toolbar?: React.ReactNode }) =>
    createElement("div", { "data-shell": true }, toolbar, children),
}));
vi.mock("@/components/staff-menu", () => ({ StaffMenu: () => null }));

const { default: Loading } = await import("./loading");

describe("/schedule loading", () => {
  it("announces that the schedule is loading and keeps the page heading", () => {
    const html = renderToStaticMarkup(createElement(Loading));
    expect(html).toMatch(/<p role="status"[^>]*>Loading the schedule<\/p>/);
    expect(html).toMatch(/<h1[^>]*>Court schedule<\/h1>/);
  });
});
