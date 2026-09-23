import { describe, expect, it } from "vitest";

import { buildGrid, closedDaysOf, openingHours, weekSpan } from "./grid";

/** AC-11: out of hours rows render below the closing time, never above opening. */

const SETTINGS = {
  days: [
    { dayOfWeek: 0, open: "08:00", close: "13:00" },
    { dayOfWeek: 1, open: "08:00", close: "13:00" },
    { dayOfWeek: 2, open: "08:00", close: "13:00" },
    { dayOfWeek: 3, open: "08:00", close: "13:00" },
    { dayOfWeek: 4, open: "08:00", close: "13:00" },
    { dayOfWeek: 5, open: "08:00", close: "13:00" },
    { dayOfWeek: 6, open: "08:00", close: "13:00" },
  ],
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

/** Spec 0007, AC-18, AC-20: the per day lookup, the span, and a closed day. */

const LATE_FRIDAY = {
  ...SETTINGS,
  days: SETTINGS.days.map((day) =>
    day.dayOfWeek === 5
      ? { ...day, close: "24:00" }
      : day.dayOfWeek === 1
        ? { dayOfWeek: 1, open: null, close: null }
        : day,
  ),
};

describe("openingHours", () => {
  it("reads the date's own day of the week, so Friday is not Thursday", () => {
    // 2026-09-18 is a Friday at the venue, 2026-09-17 a Thursday.
    expect(openingHours("2026-09-18", LATE_FRIDAY)).toEqual({ open: "08:00", close: "24:00" });
    expect(openingHours("2026-09-17", LATE_FRIDAY)).toEqual({ open: "08:00", close: "13:00" });
  });

  it("is null on a day with no times, which is what closed means", () => {
    // 2026-09-21 is a Monday.
    expect(openingHours("2026-09-21", LATE_FRIDAY)).toBeNull();
  });
});

describe("weekSpan", () => {
  it("is the earliest open and the latest close across the days that are open", () => {
    expect(weekSpan(LATE_FRIDAY.days)).toEqual({ open: "08:00", close: "24:00" });
  });

  it("falls back to 06:00 to 22:00 when every day is closed", () => {
    const shut = SETTINGS.days.map((day) => ({ ...day, open: null, close: null }));
    expect(weekSpan(shut)).toEqual({ open: "06:00", close: "22:00" });
  });

  it("reads a close at the end of the day as 24:00, never 00:00", () => {
    expect(weekSpan([{ dayOfWeek: 3, open: "06:00", close: "24:00" }])).toEqual({
      open: "06:00",
      close: "24:00",
    });
  });
});

describe("closedDaysOf", () => {
  it("names the days with no times", () => {
    expect(closedDaysOf({ days: LATE_FRIDAY.days })).toEqual([1]);
  });
});

describe("buildGrid on a closed day", () => {
  const monday = "2026-09-21";

  it("builds the week's span and marks every row outside opening hours", () => {
    const grid = buildGrid({
      date: monday,
      settings: LATE_FRIDAY,
      closedDaySpan: weekSpan(LATE_FRIDAY.days),
      courts: [{ id: 1, name: "Court 1", note: null, sortOrder: 1 }],
      blocks: [],
    });

    expect(grid.closed).toBe(true);
    expect(grid.openTime).toBe("08:00");
    expect(grid.closeTime).toBe("24:00");
    expect(grid.rows.every((row) => row.outOfHours)).toBe(true);
    expect(grid.rows.every((row) => row.cells.every((cell) => cell.state === "unavailable"))).toBe(
      true,
    );
  });

  it("keeps a booking stranded by closing the day readable as Booked", () => {
    const grid = buildGrid({
      date: monday,
      settings: LATE_FRIDAY,
      closedDaySpan: weekSpan(LATE_FRIDAY.days),
      courts: [{ id: 1, name: "Court 1", note: null, sortOrder: 1 }],
      // 9am to 10am Manila on that Monday.
      blocks: [
        {
          courtId: 1,
          startsAt: "2026-09-21T01:00:00.000Z",
          endsAt: "2026-09-21T02:00:00.000Z",
          kind: "booking",
        },
      ],
    });

    const booked = grid.rows.filter((row) => row.cells.some((cell) => cell.state === "booked"));
    expect(booked).toHaveLength(1);
    expect(booked[0].label).toBe("09:00");
  });

  it("widens the span so a booking before it still lands on a row", () => {
    const grid = buildGrid({
      date: monday,
      settings: LATE_FRIDAY,
      closedDaySpan: weekSpan(LATE_FRIDAY.days),
      courts: [{ id: 1, name: "Court 1", note: null, sortOrder: 1 }],
      // 6am to 7am Manila, two hours before the week's earliest open.
      blocks: [
        {
          courtId: 1,
          startsAt: "2026-09-20T22:00:00.000Z",
          endsAt: "2026-09-20T23:00:00.000Z",
          kind: "booking",
        },
      ],
    });

    expect(grid.openTime).toBe("06:00");
    expect(grid.rows[0].label).toBe("06:00");
    expect(grid.rows[0].cells[0].state).toBe("booked");
  });

  it("marks an ordinary open day as not closed", () => {
    const grid = buildGrid({
      date: "2026-09-17",
      settings: LATE_FRIDAY,
      closedDaySpan: weekSpan(LATE_FRIDAY.days),
      courts: [{ id: 1, name: "Court 1", note: null, sortOrder: 1 }],
      blocks: [],
    });
    expect(grid.closed).toBe(false);
    expect(grid.rows.every((row) => !row.outOfHours)).toBe(true);
  });
});
