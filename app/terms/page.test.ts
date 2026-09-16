import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/** Spec 0010, AC-2, AC-14: the terms page's metadata and heading hierarchy. */

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-shell": true }, children),
}));

const { default: TermsPage, metadata } = await import("./page");

describe("/terms", () => {
  it("has its own metadata, no noindex", () => {
    expect(metadata.title).toBe("Terms of use");
    expect(metadata.description).toBeTruthy();
    expect(metadata.robots).toBeUndefined();
  });

  it("states the board takes no bookings or payments", () => {
    const html = renderToStaticMarkup(TermsPage());
    expect(html).toMatch(/takes no bookings and no payments/i);
  });

  it("uses one h1 and an h2 per section (AC-14)", () => {
    const html = renderToStaticMarkup(TermsPage());
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect((html.match(/<h2/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
