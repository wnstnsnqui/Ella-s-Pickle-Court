import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0004 (revised), AC-9: `/staff/account` is noindex, an unreadable
 * account gets a notice, an inactive one is sent to `/staff`, and an active
 * staff member of any role gets their details with the sign out button, the
 * name form, the password form and the devices section.
 *
 * The shell, the menu and the client forms are boundaries here and are
 * mocked to markers; what is under test is which branch the page takes.
 */

const currentStaff = vi.hoisted(() => vi.fn());
const currentSession = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
);
const env = vi.hoisted(() => ({ VENUE_TIMEZONE: "Asia/Manila" }));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/session", () => ({ currentSession }));
vi.mock("@/lib/staff", () => ({ currentStaff }));
vi.mock("@/lib/env", () => env);
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-shell": true }, children),
}));
vi.mock("@/components/staff-menu", () => ({ StaffMenu: () => null }));
vi.mock("@/components/auth/name-form", () => ({
  NameForm: ({ initialName }: { initialName: string }) =>
    createElement("form", { "data-probe": "name" }, initialName),
}));
vi.mock("@/components/auth/change-password-form", () => ({
  ChangePasswordForm: () => createElement("form", { "data-probe": "password" }),
}));
vi.mock("@/components/auth/other-devices", () => ({
  OtherDevices: () => createElement("div", { "data-probe": "devices" }),
}));
vi.mock("@/components/staff-controls", () => ({
  SignOutButton: () => createElement("button", { "data-probe": "sign-out" }, "Sign out"),
}));

const { default: AccountPage, metadata, dynamic } = await import("./page");

const session = {
  user: {
    id: "user_lea",
    name: "Lea Santos",
    username: "lea.santos",
    createdAt: new Date("2026-09-01T02:00:00Z"),
  },
};

async function render() {
  return renderToStaticMarkup(await AccountPage());
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSession.mockResolvedValue(session);
  currentStaff.mockResolvedValue({
    kind: "ok",
    staff: { displayName: "Lea Santos", role: "staff", isActive: true },
  });
});

describe("/staff/account", () => {
  it("is noindex and renders per request", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(dynamic).toBe("force-dynamic");
  });

  it("sends a signed out visitor to sign in", async () => {
    currentStaff.mockResolvedValue({ kind: "signed_out" });
    currentSession.mockResolvedValue(null);
    await expect(render()).rejects.toThrow("redirect:/sign-in");
  });

  it("shows the could not load notice on error", async () => {
    currentStaff.mockResolvedValue({ kind: "error" });
    const html = await render();
    expect(html).toContain("Could not load your account");
    expect(html).not.toContain('data-probe="name"');
  });

  it("sends an inactive account back to the schedule", async () => {
    currentStaff.mockResolvedValue({
      kind: "ok",
      staff: { displayName: "Lea Santos", role: "staff", isActive: false },
    });
    await expect(render()).rejects.toThrow("redirect:/staff");
  });

  it("shows details, the name form, the password form and the devices section to plain staff", async () => {
    const html = await render();
    expect(html).toContain("lea.santos");
    expect(html).toContain("Staff");
    expect(html).toContain("September 1, 2026");
    expect(html).toContain('data-probe="sign-out"');
    expect(html).toContain('data-probe="name"');
    expect(html).toContain("Lea Santos");
    expect(html).toContain('data-probe="password"');
    expect(html).toContain('data-probe="devices"');
  });
});
