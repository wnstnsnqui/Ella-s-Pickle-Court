import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0005, AC-1 and AC-12: `/staff` is noindex, an inactive or unreadable
 * account gets a notice and never a schedule read, and an active staff member
 * gets the board, read with the date they asked for.
 *
 * The shell, the menu and the board are boundaries here and are mocked to
 * markers; what is under test is which branch the page takes.
 */

const currentStaff = vi.hoisted(() => vi.fn());
const getStaffSchedule = vi.hoisted(() => vi.fn());
const currentSession = vi.hoisted(() => vi.fn(async () => ({ user: { id: "user_owner" } })));

vi.mock("@/lib/auth/session", () => ({ currentSession }));
vi.mock("@/lib/staff", () => ({ currentStaff }));
vi.mock("@/lib/schedule/queries", () => ({ getStaffSchedule }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-shell": true }, children),
}));
vi.mock("@/components/staff-menu", () => ({ StaffMenu: () => null }));
vi.mock("@/components/staff/staff-toolbar", () => ({ StaffToolbar: () => null }));
vi.mock("@/components/staff/staff-board", () => ({
  StaffBoard: () => createElement("div", { "data-board": true }),
}));
vi.mock("@/components/staff/staff-schedule-context", () => ({
  StaffScheduleProvider: ({ children, date }: { children: React.ReactNode; date: string }) =>
    createElement("div", { "data-provider": date }, children),
}));

const { default: StaffPage, metadata, dynamic } = await import("./page");

const schedule = {
  grid: { date: "2026-09-16", timezone: "Asia/Manila", courts: [], rows: [] },
  settingsVersion: 1,
  horizonDays: 14,
  reservations: [],
  staff: [],
};

async function render(date?: string) {
  const element = await StaffPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(date ? { date } : {}),
  });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  getStaffSchedule.mockResolvedValue({ ok: true, data: schedule });
});

describe("/staff", () => {
  it("is noindex and renders per request (AC-1, invariant 7)", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(dynamic).toBe("force-dynamic");
  });

  it("shows the switched off notice and never reads the day for an inactive account (AC-12)", async () => {
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
    expect(html).toContain("Your account is switched off");
    expect(html).not.toContain("data-board");
    expect(getStaffSchedule).not.toHaveBeenCalled();
  });

  it("shows the could not load notice when the staff row is unreadable", async () => {
    currentStaff.mockResolvedValue({ kind: "error" });
    const html = await render();
    expect(html).toContain("Could not load your account");
    expect(getStaffSchedule).not.toHaveBeenCalled();
  });

  it("renders the board for an active staff member, on the day asked for (AC-2)", async () => {
    currentStaff.mockResolvedValue({
      kind: "ok",
      staff: {
        displayName: "Ella",
        role: "owner",
        isActive: true,
        privacyAcknowledgedVersion: null,
      },
    });
    const html = await render("2026-09-16");
    expect(getStaffSchedule).toHaveBeenCalledWith("2026-09-16");
    expect(html).toContain("data-board");
    expect(html).toContain('data-provider="2026-09-16"');
  });

  it("explains a day that could not be read and offers the way back", async () => {
    currentStaff.mockResolvedValue({
      kind: "ok",
      staff: {
        displayName: "Ella",
        role: "owner",
        isActive: true,
        privacyAcknowledgedVersion: null,
      },
    });
    getStaffSchedule.mockResolvedValue({
      ok: false,
      error: { kind: "invalid", message: "Use a date like 2026-09-05.", issues: {} },
    });
    const html = await render("nope");
    expect(html).toContain("Use a date like 2026-09-05.");
    expect(html).toContain('href="/staff"');
  });
});
