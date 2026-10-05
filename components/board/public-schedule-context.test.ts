import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Schedule } from "@/lib/schedule/queries";

/**
 * Spec 0014, AC-2: the public board's provider derives `dayNavPending` from
 * the hook's `pendingDate`, so the board card's heading and day strip show the
 * pending day at once (spec 0018, AC-8) and the grid of the day still on
 * screen is dimmed and busy. The
 * hook itself (the channel, the reads) needs a browser; it is stood in for
 * here by the state it would hand back.
 */

const schedule = {
  grid: {
    date: "2026-09-29",
    timezone: "Asia/Manila",
    openTime: "14:00",
    closeTime: "16:00",
    slotMinutes: 60,
    closed: false,
    courts: [{ id: 1, name: "Court 1", note: null, sortOrder: 1 }],
    rows: [
      {
        startsAt: "2026-09-29T06:00:00Z",
        endsAt: "2026-09-29T07:00:00Z",
        label: "14:00",
        outOfHours: false,
        cells: [{ courtId: 1, state: "available", blocks: [] }],
      },
    ],
  },
  horizonDays: 14,
  now: "2026-09-29T04:00:00.000Z",
  hours: { days: [] },
  settingsVersion: 1,
  hourlyRate: 250,
} as unknown as Schedule;

let pendingDate: string | undefined;
vi.mock("./use-public-schedule", () => ({
  usePublicSchedule: () => ({
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
    now: Date.parse(schedule.now),
  }),
}));
vi.mock("@/lib/analytics/browser", () => ({ captureDayViewed: () => {} }));

const { PublicScheduleProvider, usePublicBoard } = await import("./public-schedule-context");
const { PublicBoard } = await import("./public-board");

function Probe() {
  const { dayNavPending } = usePublicBoard();
  return createElement("span", { "data-pending": String(dayNavPending) });
}

/** The board card's day heading. */
const heading = (html: string) => html.match(/<h2[^>]*>(.*?)<\/h2>/)?.[1] ?? "";

/** The days the strip has checked, by name (both of its rows render). */
const checkedDays = (html: string) =>
  (html.match(/<input[^>]*>/g) ?? [])
    .filter((input) => input.includes('checked=""'))
    .map((input) => input.match(/aria-label="([^"]+)"/)?.[1]);

const render = () =>
  renderToStaticMarkup(
    createElement(
      PublicScheduleProvider,
      { initial: schedule } as ComponentProps<typeof PublicScheduleProvider>,
      createElement(Probe),
      createElement(PublicBoard),
    ),
  );

beforeEach(() => {
  pendingDate = undefined;
});

describe("PublicScheduleProvider", () => {
  it("is at rest when no day is pending: today in the heading, the grid not busy", () => {
    const html = render();
    expect(html).toContain('data-pending="false"');
    expect(heading(html)).toContain("Today, </span>Tue 29 Sep");
    expect(checkedDays(html)).toContain("Today, Tue 29 Sep");
    expect(html).not.toContain('aria-busy="true"');
  });

  it("marks the board pending while a day is read, and dims the grid still on screen (AC-2)", () => {
    pendingDate = "2026-09-30";
    const html = render();
    expect(html).toContain('data-pending="true"');
    // The heading and the strip jump to the pending day; the grid still shows the day on screen.
    expect(heading(html)).toBe("Wed 30 Sep");
    expect(checkedDays(html)).toContain("Wed 30 Sep");
    expect(html).toContain("Court 1 at 2pm");
    const busy = html.match(/<div[^>]*aria-busy="true"[^>]*>/)?.[0] ?? "";
    expect(busy).toContain("pointer-events-none");
    expect(busy).toContain("opacity-50");
  });

  it("throws a clear error when a board part is used outside the provider", () => {
    expect(() => renderToStaticMarkup(createElement(Probe))).toThrow(
      "usePublicBoard needs a PublicScheduleProvider above it.",
    );
  });
});
