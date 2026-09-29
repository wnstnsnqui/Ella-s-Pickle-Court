import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffSchedule } from "@/lib/schedule/queries";

/**
 * Spec 0014, AC-2 and AC-9: the staff board's provider takes the day the page
 * was opened on (undefined for today) as the hook's starting point only, and
 * derives `dayNavPending` from the hook's `pendingDate`, so the toolbar shows
 * the pending day with its one spinner. The hook itself needs a browser; it
 * is stood in for by the state it would hand back.
 */

const schedule = {
  grid: { date: "2026-09-29", timezone: "Asia/Manila", courts: [], rows: [] },
  horizonDays: 30,
  now: "2026-09-29T04:00:00.000Z",
  hours: { days: [] },
  settingsVersion: 1,
  reservations: [],
  staff: [],
} as unknown as StaffSchedule;

let pendingDate: string | undefined;
const useStaffSchedule = vi.fn();
vi.mock("./use-staff-schedule", () => ({ useStaffSchedule }));

const { StaffScheduleProvider, useStaffBoard } = await import("./staff-schedule-context");
const { StaffToolbar } = await import("./staff-toolbar");

function Probe() {
  const { dayNavPending, viewer } = useStaffBoard();
  return createElement("span", { "data-pending": String(dayNavPending), "data-role": viewer.role });
}

const render = (date?: string) =>
  renderToStaticMarkup(
    createElement(
      StaffScheduleProvider,
      { initial: schedule, date, viewer: { userId: "u1", role: "owner" } } as ComponentProps<
        typeof StaffScheduleProvider
      >,
      createElement(Probe),
      createElement(StaffToolbar),
    ),
  );

beforeEach(() => {
  pendingDate = undefined;
  useStaffSchedule.mockReset();
  useStaffSchedule.mockImplementation(() => ({
    schedule,
    date: undefined,
    pendingDate,
    goToDay: () => {},
    refetchError: null,
    channelStatus: "SUBSCRIBED",
    lastUpdatedAt: 0,
    requestRead: () => {},
    refetch: async () => null,
    subscribe: () => () => {},
  }));
});

describe("StaffScheduleProvider", () => {
  it("hands the hook the page's day, undefined for an undated board (AC-9)", () => {
    render();
    expect(useStaffSchedule).toHaveBeenLastCalledWith(schedule, undefined);
    render("2026-10-02");
    expect(useStaffSchedule).toHaveBeenLastCalledWith(schedule, "2026-10-02");
  });

  it("passes the viewer through and is at rest with no day pending", () => {
    const html = render();
    expect(html).toContain('data-pending="false"');
    expect(html).toContain('data-role="owner"');
    expect(html).toContain("Today, Sep 29");
  });

  it("shows the pending day and spins Next while tomorrow is read (AC-2)", () => {
    pendingDate = "2026-09-30";
    const html = render();
    expect(html).toContain('data-pending="true"');
    expect(html).toContain("Wed, Sep 30");
    expect(html).toMatch(/<button[^>]*aria-label="Next day"[^>]*aria-busy="true"/);
  });

  it("throws a clear error when a board part is used outside the provider", () => {
    expect(() => renderToStaticMarkup(createElement(Probe))).toThrow(
      "useStaffBoard needs a StaffScheduleProvider above it.",
    );
  });
});
