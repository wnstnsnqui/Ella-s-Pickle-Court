import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Spec 0010, AC-1, AC-4, AC-7: the privacy page's metadata, and that every
 * fact it prints comes from the constants (so it cannot drift from the
 * purge). `AppShell` is a boundary and is stood in for a plain wrapper.
 */

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-shell": true }, children),
}));

const { default: PrivacyPage, metadata } = await import("./page");
const { PHONE_RETENTION_DAYS, PRIVACY_CONTACT_EMAIL, VENUE_LEGAL_NAME } =
  await import("@/lib/legal/constants");

describe("/privacy", () => {
  it("has its own metadata, no noindex", () => {
    expect(metadata.title).toBe("Privacy notice");
    expect(metadata.description).toBeTruthy();
    expect(metadata.robots).toBeUndefined();
  });

  it("prints the retention days and the contact facts from the constants (AC-4, AC-7)", () => {
    const html = renderToStaticMarkup(PrivacyPage());
    expect(html).toContain(String(PHONE_RETENTION_DAYS));
    expect(html).toContain(PRIVACY_CONTACT_EMAIL);
    expect(html).toContain(VENUE_LEGAL_NAME);
  });

  it("uses one h1 and an h2 per section (AC-14)", () => {
    const html = renderToStaticMarkup(PrivacyPage());
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect((html.match(/<h2/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
