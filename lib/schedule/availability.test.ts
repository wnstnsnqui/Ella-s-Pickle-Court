import { describe, expect, it } from "vitest";

import { manila, scheduleFixture } from "@/components/landing/test-fixture";

import { nextFreeCell, openRows, upcomingRows } from "./availability";

/**
 * Spec 0013, AC-3 and AC-15: the landing reads open rows only; the hero takes
 * the next five not yet ended; the chip names the earliest Free cell after
 * now, the first court in sort order winning a tie.
 */

const DAY = "2026-09-26";
const booked = (courtId: number, from: string, to: string) => ({
  courtId,
  startsAt: manila(DAY, from),
  endsAt: manila(DAY, to),
  kind: "booking" as const,
});

describe("upcomingRows", () => {
  it("takes the next five open rows, keeping the one under way", () => {
    const { grid } = scheduleFixture();
    const rows = upcomingRows(grid, Date.parse(manila(DAY, "15:12")));
    expect(rows.map((row) => row.label)).toEqual(["15:00", "16:00", "17:00", "18:00", "19:00"]);
  });

  it("is empty after closing", () => {
    const { grid } = scheduleFixture();
    expect(upcomingRows(grid, Date.parse(manila(DAY, "22:30")))).toEqual([]);
  });

  it("leaves out a staff only row outside opening hours", () => {
    const { grid } = scheduleFixture({ blocks: [booked(1, "22:00", "23:00")] });
    expect(grid.rows.some((row) => row.outOfHours)).toBe(true);
    expect(openRows(grid).some((row) => row.outOfHours)).toBe(false);
  });
});

describe("nextFreeCell", () => {
  it("skips the hour under way and a booked cell, and prefers the first court on a tie", () => {
    const { grid } = scheduleFixture({ blocks: [booked(1, "16:00", "17:00")] });
    const free = nextFreeCell(grid, Date.parse(manila(DAY, "15:12")));
    expect(free?.court.name).toBe("Court 2");
    expect(free?.row.label).toBe("16:00");
  });

  it("names Court 1 when both courts are free at the same hour", () => {
    const { grid } = scheduleFixture();
    const free = nextFreeCell(grid, Date.parse(manila(DAY, "15:12")));
    expect(free?.court.name).toBe("Court 1");
  });

  it("follows sort order, not id order", () => {
    const { grid } = scheduleFixture({
      courts: [
        { id: 1, name: "Court 1", note: null, sortOrder: 2 },
        { id: 2, name: "Court 2", note: null, sortOrder: 1 },
      ],
    });
    expect(nextFreeCell(grid, Date.parse(manila(DAY, "15:12")))?.court.name).toBe("Court 2");
  });

  it("is null when everything left is booked", () => {
    const { grid } = scheduleFixture({
      blocks: [booked(1, "16:00", "22:00"), booked(2, "16:00", "22:00")],
    });
    expect(nextFreeCell(grid, Date.parse(manila(DAY, "15:12")))).toBeNull();
  });
});
