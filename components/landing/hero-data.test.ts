import { describe, expect, it } from "vitest";

import { heroBoardForToday, heroBoardForTomorrow } from "./hero-data";
import { manila, scheduleFixture, WEEK } from "./test-fixture";

/**
 * Spec 0013, AC-15: the hero shows today's next hours with "As of" in venue
 * time and the next free court, falls back to tomorrow after closing, and has
 * no board for a closed tomorrow.
 */

const DAY = "2026-09-26";

describe("heroBoardForToday", () => {
  it("shows the next five hours on both courts, captioned in venue time", () => {
    const { grid, now } = scheduleFixture();
    const board = heroBoardForToday(grid, now);
    expect(board?.caption).toBe("As of 3:12pm");
    expect(board?.columns.map((c) => c.label)).toEqual(["3pm", "4pm", "5pm", "6pm", "7pm"]);
    expect(board?.columns[0].tiles).toHaveLength(2);
    expect(board?.chip).toBe("Court 1 is free at 4pm");
  });

  it("marks booked and closed tiles", () => {
    const { grid, now } = scheduleFixture({
      blocks: [
        {
          courtId: 1,
          startsAt: manila(DAY, "16:00"),
          endsAt: manila(DAY, "17:00"),
          kind: "booking",
        },
        {
          courtId: 2,
          startsAt: manila(DAY, "16:00"),
          endsAt: manila(DAY, "17:00"),
          kind: "closed",
        },
      ],
    });
    const board = heroBoardForToday(grid, now);
    expect(board?.columns[1].tiles.map((t) => t.tile)).toEqual(["booked", "closed"]);
    expect(board?.chip).toBe("Court 1 is free at 5pm");
  });

  it("says fully booked when nothing is free", () => {
    const { grid, now } = scheduleFixture({
      blocks: [1, 2].map((courtId) => ({
        courtId,
        startsAt: manila(DAY, "15:00"),
        endsAt: manila(DAY, "22:00"),
        kind: "booking" as const,
      })),
    });
    expect(heroBoardForToday(grid, now)?.chip).toBe("Fully booked today");
  });

  it("is null after closing, the cue to read tomorrow", () => {
    const { grid, now } = scheduleFixture({ now: manila(DAY, "22:05") });
    expect(heroBoardForToday(grid, now)).toBeNull();
  });
});

describe("heroBoardForTomorrow", () => {
  it("shows tomorrow's first hours under Closed now", () => {
    const { grid } = scheduleFixture({ date: "2026-09-27" });
    const board = heroBoardForTomorrow(grid);
    expect(board?.caption).toBe("Closed now · Tomorrow");
    expect(board?.columns[0].label).toBe("6am");
    expect(board?.chip).toBe("Court 1 is free at 6am tomorrow");
  });

  it("is null when tomorrow is closed", () => {
    const days = WEEK.map((d) => (d.dayOfWeek === 0 ? { ...d, open: null, close: null } : d));
    const { grid } = scheduleFixture({ date: "2026-09-27", days });
    expect(heroBoardForTomorrow(grid)).toBeNull();
  });
});
