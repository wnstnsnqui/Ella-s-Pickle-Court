import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0010, AC-10 and AC-12: the privacy notice dialog shows only for a
 * signed in, active staff member whose stored version does not match the
 * current constant, and bumping the constant brings it back for someone who
 * already acknowledged the old one.
 */

const auth = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth }));

const currentStaff = vi.hoisted(() => vi.fn());
vi.mock("@/lib/staff", () => ({ currentStaff }));

vi.mock("@/components/analytics/staff-identity", () => ({
  StaffIdentity: () => createElement("div", { "data-identity": true }),
}));

vi.mock("@/components/staff/privacy-notice-dialog", () => ({
  PrivacyNoticeDialog: ({ open }: { open: boolean }) =>
    createElement("div", { "data-dialog": open ? "open" : "closed" }),
}));

const { default: StaffLayout } = await import("./layout");
const { PRIVACY_NOTICE_VERSION } = await import("@/lib/legal/constants");

async function render() {
  const element = await StaffLayout({ children: createElement("p", null, "content") });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StaffLayout privacy notice gate", () => {
  it("shows no dialog for a signed out visitor", async () => {
    auth.mockResolvedValue({ userId: null });
    currentStaff.mockResolvedValue({ kind: "signed_out" });
    const html = await render();
    expect(html).not.toContain("data-dialog");
    expect(html).not.toContain("data-identity");
  });

  it("shows no dialog for an inactive staff account", async () => {
    auth.mockResolvedValue({ userId: "user_1" });
    currentStaff.mockResolvedValue({
      kind: "ok",
      staff: {
        displayName: "Lea",
        role: "staff",
        isActive: false,
        privacyAcknowledgedVersion: null,
      },
    });
    const html = await render();
    expect(html).not.toContain("data-dialog");
    expect(html).not.toContain("data-identity");
  });

  it("opens the dialog for an active staff member who has not acknowledged the current version", async () => {
    auth.mockResolvedValue({ userId: "user_1" });
    currentStaff.mockResolvedValue({
      kind: "ok",
      staff: {
        displayName: "Ella",
        role: "owner",
        isActive: true,
        privacyAcknowledgedVersion: null,
      },
    });
    const html = await render();
    expect(html).toContain('data-dialog="open"');
    expect(html).toContain("data-identity");
  });

  it("stays closed for an active staff member who already acknowledged the current version", async () => {
    auth.mockResolvedValue({ userId: "user_1" });
    currentStaff.mockResolvedValue({
      kind: "ok",
      staff: {
        displayName: "Ella",
        role: "owner",
        isActive: true,
        privacyAcknowledgedVersion: PRIVACY_NOTICE_VERSION,
      },
    });
    const html = await render();
    expect(html).toContain('data-dialog="closed"');
  });

  it("reopens when the acknowledged version no longer matches, e.g. after a bump (AC-12)", async () => {
    auth.mockResolvedValue({ userId: "user_1" });
    currentStaff.mockResolvedValue({
      kind: "ok",
      staff: {
        displayName: "Ella",
        role: "owner",
        isActive: true,
        privacyAcknowledgedVersion: "2020-01-01",
      },
    });
    const html = await render();
    expect(html).toContain('data-dialog="open"');
  });
});
