import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0006, AC-1, AC-2, AC-11 and AC-12: `/` renders per request on the public
 * read, refuses a day it cannot show with a way back to today, carries the venue
 * title on `/` and the day in the title on a dated link with a canonical of `/`,
 * and embeds the venue's opening hours as structured data.
 *
 * The shell, the menu, the toolbar and the board are boundaries here and are
 * mocked to markers; what is under test is the page's own branching.
 */

const getSchedule = vi.hoisted(() => vi.fn());
vi.mock("@/lib/schedule/queries", () => ({ getSchedule }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, toolbar }: { children: React.ReactNode; toolbar?: React.ReactNode }) =>
    createElement("div", { "data-shell": true }, toolbar, children),
}));
vi.mock("@/components/staff-menu", () => ({ StaffMenu: () => null }));
vi.mock("@/components/board/public-toolbar", () => ({
  PublicToolbar: () => createElement("div", { "data-toolbar": true }),
}));
vi.mock("@/components/board/public-board", () => ({
  PublicBoard: () => createElement("div", { "data-board": true }),
}));
vi.mock("@/components/board/public-schedule-context", () => ({
  PublicScheduleProvider: ({
    children,
    requestedDate,
  }: {
    children: React.ReactNode;
    requestedDate?: string;
  }) => createElement("div", { "data-provider": requestedDate ?? "today" }, children),
}));

const { default: Home, generateMetadata, dynamic } = await import("./page");

const schedule = {
  grid: { date: "2026-09-20", timezone: "Asia/Manila", courts: [], rows: [] },
  settingsVersion: 1,
  horizonDays: 14,
  now: "2026-09-14T10:00:00.000Z",
  hours: {
    days: [
      { dayOfWeek: 0, open: "07:00", close: "23:00" },
      { dayOfWeek: 1, open: "06:00", close: "22:00" },
      { dayOfWeek: 2, open: "06:00", close: "22:00" },
      { dayOfWeek: 3, open: "06:00", close: "22:00" },
      { dayOfWeek: 4, open: "06:00", close: "22:00" },
      { dayOfWeek: 5, open: "06:00", close: "22:00" },
      { dayOfWeek: 6, open: "07:00", close: "23:00" },
    ],
  },
};

const props = (date?: string) => ({
  params: Promise.resolve({}),
  searchParams: Promise.resolve(date ? { date } : {}),
});

async function render(date?: string) {
  return renderToStaticMarkup(await Home(props(date)));
}

beforeEach(() => {
  vi.clearAllMocks();
  getSchedule.mockResolvedValue({ ok: true, data: schedule });
});

describe("/", () => {
  it("renders per request (AC-1)", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("reads today on the public read when no date is given, and marks the board undated (AC-2, AC-10)", async () => {
    const html = await render();
    expect(getSchedule).toHaveBeenCalledWith(undefined);
    expect(html).toContain("data-board");
    expect(html).toContain('data-provider="today"');
    expect(html).toContain("data-toolbar");
  });

  it("passes a dated link through and keeps the board on that date (AC-2, AC-10)", async () => {
    const html = await render("2026-09-20");
    expect(getSchedule).toHaveBeenCalledWith("2026-09-20");
    expect(html).toContain('data-provider="2026-09-20"');
  });

  it("explains a day it cannot show and offers the way back to today, with no grid (AC-2)", async () => {
    getSchedule.mockResolvedValue({
      ok: false,
      error: { kind: "invalid", message: "That day has passed.", issues: {} },
    });
    const html = await render("2026-01-01");
    expect(html).toContain("That day could not be shown");
    expect(html).toContain("That day has passed.");
    expect(html).toContain('href="/"');
    expect(html).not.toContain("data-board");
  });

  it("embeds the venue as structured data with the settings' hours (AC-11)", async () => {
    const html = await render();
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type":"SportsActivityLocation"');
    expect(html).toContain('"opens":"07:00","closes":"23:00"');
    expect(html).not.toMatch(/customer|amount/);
  });

  it("keeps the venue title on / and points every page at / (AC-11)", async () => {
    const meta = await generateMetadata(props());
    expect(meta.title).toBeUndefined();
    expect(meta.alternates).toEqual({ canonical: "/" });
    expect(getSchedule).not.toHaveBeenCalled();
  });

  it("puts the day in the title on a dated link, canonical to / (AC-11)", async () => {
    const meta = await generateMetadata(props("2026-09-20"));
    expect(meta.title).toBe("Court schedule for Sun 20 Sep · Ella's Picklecourt");
    expect(meta.alternates).toEqual({ canonical: "/" });
  });

  it("falls back to the venue title when a dated link cannot be shown (AC-11)", async () => {
    getSchedule.mockResolvedValue({
      ok: false,
      error: { kind: "invalid", message: "x", issues: {} },
    });
    const meta = await generateMetadata(props("nope"));
    expect(meta.title).toBeUndefined();
  });
});
