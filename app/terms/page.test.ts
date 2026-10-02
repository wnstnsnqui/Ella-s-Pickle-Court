import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Spec 0010, AC-2, AC-14: the terms page's metadata and heading hierarchy.
 * Spec 0015, AC-22: the booking section prints the same rules the checkout's
 * Terms step shows, and the version a booking records.
 */

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-shell": true }, children),
}));

const { default: TermsPage, metadata } = await import("./page");
const { BOOKING_RULES, BOOKING_TERMS_VERSION } = await import("@/lib/legal/constants");

describe("/terms", () => {
  it("has its own metadata, no noindex", () => {
    expect(metadata.title).toBe("Terms of use");
    expect(metadata.description).toBeTruthy();
    expect(metadata.robots).toBeUndefined();
  });

  it("prints every booking rule and the terms version from the constants (spec 0015, AC-22)", () => {
    const html = renderToStaticMarkup(TermsPage());
    expect(html).toContain("Booking online");
    expect(html).toContain(BOOKING_TERMS_VERSION);
    for (const rule of BOOKING_RULES) expect(html).toContain(rule.replaceAll("'", "&#x27;"));
  });

  it("says the site takes no payment itself (spec 0015)", () => {
    const html = renderToStaticMarkup(TermsPage());
    expect(html).toMatch(/takes no payment itself/i);
    expect(html).not.toMatch(/takes no bookings/i);
  });

  it("uses one h1 and an h2 per section (AC-14)", () => {
    const html = renderToStaticMarkup(TermsPage());
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect((html.match(/<h2/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
