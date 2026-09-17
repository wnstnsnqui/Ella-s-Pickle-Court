import { describe, expect, it } from "vitest";

import { buildGrid } from "./grid";

/** AC-11: out of hours rows render below the closing time, never above opening. */

const SETTINGS = {
  weekdayOpen: "08:00",
  weekdayClose: "13:00",
  weekendOpen: "08:00",
  weekendClose: "13:00",
  slotMinutes: 60,
  bookingHorizonDays: 14,
  timezone: "Asia/Manila",
  version: 1,
};

describe("buildGrid", () => {
  it("puts an early morning out of hours booking below every in hours row, not above", () => {
    // A booking at 6am local, before the 8am opening time.
    const grid = buildGrid({
      date: "2026-09-16",
      settings: SETTINGS,
      courts: [{ id: 1, name: "Court 1", note: null, sortOrder: 1 }],
      blocks: [
        {
          courtId: 1,
          startsAt: "2026-09-15T22:00:00.000Z",
          endsAt: "2026-09-15T23:00:00.000Z",
          kind: "booking",
        },
      ],
    });

    expect(grid.rows.map((row) => ({ label: row.label, outOfHours: row.outOfHours }))).toEqual([
      { label: "08:00", outOfHours: false },
      { label: "09:00", outOfHours: false },
      { label: "10:00", outOfHours: false },
      { label: "11:00", outOfHours: false },
      { label: "12:00", outOfHours: false },
      { label: "06:00", outOfHours: true },
    ]);
  });

  it("keeps multiple out of hours rows sorted among themselves, below the in hours rows", () => {
    const grid = buildGrid({
      date: "2026-09-16",
      settings: SETTINGS,
      courts: [{ id: 1, name: "Court 1", note: null, sortOrder: 1 }],
      blocks: [
        // 2pm local, an hour after the 1pm close.
        {
          courtId: 1,
          startsAt: "2026-09-16T06:00:00.000Z",
          endsAt: "2026-09-16T07:00:00.000Z",
          kind: "booking",
        },
        // 6am local, before the 8am open.
        {
          courtId: 1,
          startsAt: "2026-09-15T22:00:00.000Z",
          endsAt: "2026-09-15T23:00:00.000Z",
          kind: "booking",
        },
      ],
    });

    const outOfHoursLabels = grid.rows.filter((row) => row.outOfHours).map((row) => row.label);
    const lastInHoursIndex = grid.rows.map((row) => row.outOfHours).lastIndexOf(false);
    const firstOutOfHoursIndex = grid.rows.findIndex((row) => row.outOfHours);

    expect(outOfHoursLabels).toEqual(["06:00", "14:00"]);
    expect(firstOutOfHoursIndex).toBeGreaterThan(lastInHoursIndex);
  });
});
