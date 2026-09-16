import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentStaff } from "@/lib/staff";

/**
 * Spec 0004, AC-4, AC-5 and AC-8: one rendering per answer from
 * `currentStaff()`, and a sign out button in every one of them.
 *
 * The two client buttons need Clerk's provider, so they are stood in for by
 * plain markers here. What is under test is which state the menu picks.
 */

let current: CurrentStaff = { kind: "signed_out" };
vi.mock("@/lib/staff", () => ({ currentStaff: async () => current }));

vi.mock("@/components/staff-controls", () => ({
  AccountButton: ({ name }: { name: string }) =>
    createElement("button", { "data-probe": "account" }, name),
  SignOutButton: () => createElement("button", { "data-probe": "sign-out" }, "Sign out"),
}));

async function render() {
  const { StaffMenu } = await import("./staff-menu");
  return renderToStaticMarkup(await StaffMenu());
}

beforeEach(() => {
  current = { kind: "signed_out" };
});

describe("StaffMenu", () => {
  it("renders nothing for a signed out visitor (AC-4)", async () => {
    expect(await render()).toBe("");
  });

  it("shows the display name from the staff row and a sign out button (AC-4)", async () => {
    current = {
      kind: "ok",
      staff: {
        displayName: "Ella",
        role: "owner",
        isActive: true,
        privacyAcknowledgedVersion: null,
      },
    };
    const html = await render();
    expect(html).toContain('data-probe="account"');
    expect(html).toContain("Ella");
    expect(html).toContain('data-probe="sign-out"');
  });

  it("shows the switched off notice, not the name, for an inactive account (AC-5)", async () => {
    current = {
      kind: "ok",
      staff: {
        displayName: "Sam",
        role: "staff",
        isActive: false,
        privacyAcknowledgedVersion: null,
      },
    };
    const html = await render();
    expect(html).toContain("Your account is switched off");
    expect(html).not.toContain('data-probe="account"');
    expect(html).toContain('data-probe="sign-out"');
    expect(html).toMatch(/<p[^>]*role="status"/);
  });

  it("shows the could not load notice with a sign out button on error (AC-8)", async () => {
    current = { kind: "error" };
    const html = await render();
    expect(html).toContain("Could not load your account");
    expect(html).toContain('data-probe="sign-out"');
    expect(html).not.toContain('data-probe="account"');
  });

  it("pairs every notice with an icon, so colour is never the only signal", async () => {
    current = { kind: "error" };
    expect(await render()).toMatch(/<svg[^>]*aria-hidden="true"/);
  });
});
