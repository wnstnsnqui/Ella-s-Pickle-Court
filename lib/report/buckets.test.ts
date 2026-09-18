import { describe, expect, it } from "vitest";

import {
  byDay,
  byHour,
  byWeekdayHour,
  datesInRange,
  hourAxis,
  openMinutesForDate,
  totals,
  type ReportHours,
  type UsageRow,
} from "./buckets";

/** Weekday 8am to 10pm, weekend 6am to midnight, spec 0007's own seed. */
const HOURS: ReportHours = {
  weekdayOpen: "08:00",
  weekdayClose: "22:00",
  weekendOpen: "06:00",
  weekendClose: "24:00",
};

// 2026-09-14 is a Monday, 2026-09-19 a Saturday, 2026-09-20 a Sunday.
const MONDAY = "2026-09-14";
const SATURDAY = "2026-09-19";

describe("datesInRange", () => {
  it("includes both ends", () => {
    expect(datesInRange(MONDAY, "2026-09-16")).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
  });

  it("returns one date for a single day range", () => {
    expect(datesInRange(MONDAY, MONDAY)).toEqual([MONDAY]);
  });
});

describe("openMinutesForDate", () => {
  it("uses the weekday pair on a weekday", () => {
    expect(openMinutesForDate(MONDAY, HOURS, 2)).toBe((22 - 8) * 60 * 2);
  });

  it("uses the weekend pair, reading 24:00 as 1440, on a weekend day", () => {
    expect(openMinutesForDate(SATURDAY, HOURS, 1)).toBe((24 - 6) * 60);
  });
});

describe("byHour", () => {
  const dates = [MONDAY];
  const rows: UsageRow[] = [
    { courtId: 1, localDate: MONDAY, hour: 16, bookedMinutes: 30 },
    { courtId: 2, localDate: MONDAY, hour: 16, bookedMinutes: 20 },
  ];

  it("sums booked minutes across courts for each hour, with open minutes for hours inside the pair", () => {
    const buckets = byHour(rows, dates, HOURS, 2);
    const hour16 = buckets.find((bucket) => bucket.hour === 16);
    expect(hour16?.bookedMinutes).toBe(50);
    expect(hour16?.openMinutes).toBe(60 * 2);
    expect(hour16?.utilisationPercent).toBe(Math.round((50 / 120) * 100));

    // 2am is outside the weekday pair on every date in range: no open minutes.
    const hour2 = buckets.find((bucket) => bucket.hour === 2);
    expect(hour2?.bookedMinutes).toBe(0);
    expect(hour2?.openMinutes).toBe(0);
    expect(hour2?.utilisationPercent).toBe(0);
  });

  it("returns all 24 hours even with no rows", () => {
    expect(byHour([], dates, HOURS, 1)).toHaveLength(24);
  });
});

describe("byDay", () => {
  it("fills every date in the range, zero included", () => {
    const dates = datesInRange(MONDAY, "2026-09-16");
    const rows: UsageRow[] = [{ courtId: 1, localDate: MONDAY, hour: 9, bookedMinutes: 60 }];
    const buckets = byDay(rows, dates, HOURS, 1);
    expect(buckets).toHaveLength(3);
    expect(buckets[0]).toMatchObject({ date: MONDAY, bookedMinutes: 60 });
    expect(buckets[1]).toMatchObject({
      date: "2026-09-15",
      bookedMinutes: 0,
      utilisationPercent: 0,
    });
  });

  it("caps utilisation at 100 percent", () => {
    const dates = [MONDAY];
    // 20 hours booked against a 14 hour weekday window (impossible in
    // reality across one court, but the cap has to hold regardless).
    const rows: UsageRow[] = [{ courtId: 1, localDate: MONDAY, hour: 9, bookedMinutes: 20 * 60 }];
    const [bucket] = byDay(rows, dates, HOURS, 1);
    expect(bucket.utilisationPercent).toBe(100);
  });
});

describe("byWeekdayHour", () => {
  it("places a row on its own weekday and hour, and reports zero elsewhere", () => {
    const dates = [MONDAY];
    const rows: UsageRow[] = [{ courtId: 1, localDate: MONDAY, hour: 10, bookedMinutes: 45 }];
    const cells = byWeekdayHour(rows, dates, HOURS, 1);
    expect(cells).toHaveLength(7 * 24);
    const mondayTen = cells.find((cell) => cell.weekday === 1 && cell.hour === 10);
    expect(mondayTen?.bookedMinutes).toBe(45);
    const tuesdayTen = cells.find((cell) => cell.weekday === 2 && cell.hour === 10);
    expect(tuesdayTen?.bookedMinutes).toBe(0);
  });
});

describe("totals", () => {
  it("sums booked and open minutes and finds the busiest hour and date, ties going earliest", () => {
    const dates = [MONDAY, "2026-09-15"];
    const rows: UsageRow[] = [
      { courtId: 1, localDate: MONDAY, hour: 9, bookedMinutes: 60 },
      { courtId: 1, localDate: MONDAY, hour: 10, bookedMinutes: 60 },
    ];
    const result = totals(rows, dates, HOURS, 1);
    expect(result.bookedMinutes).toBe(120);
    expect(result.openMinutes).toBe((22 - 8) * 60 * 2);
    // Both hour 9 and hour 10 tie at 60 minutes; the earliest wins.
    expect(result.busiestHour).toBe(9);
    // Only MONDAY has any booked minutes, so it wins outright.
    expect(result.busiestDate).toBe(MONDAY);
  });

  it("reports no busiest hour or date, and zero utilisation, for an empty range", () => {
    const result = totals([], [MONDAY], HOURS, 1);
    expect(result.bookedMinutes).toBe(0);
    expect(result.busiestHour).toBeNull();
    expect(result.busiestDate).toBeNull();
    expect(result.utilisationPercent).toBe(0);
  });
});

describe("hourAxis", () => {
  it("spans the earliest open to the latest close across both day pairs", () => {
    expect(hourAxis(HOURS, [])).toEqual(Array.from({ length: 24 - 6 }, (_, index) => 6 + index));
  });

  it("widens to include an hour with booked minutes outside the pair", () => {
    const rows: UsageRow[] = [{ courtId: 1, localDate: MONDAY, hour: 2, bookedMinutes: 30 }];
    const axis = hourAxis(HOURS, rows);
    expect(axis[0]).toBe(2);
  });

  it("never widens for an hour with zero booked minutes", () => {
    const rows: UsageRow[] = [{ courtId: 1, localDate: MONDAY, hour: 2, bookedMinutes: 0 }];
    expect(hourAxis(HOURS, rows)[0]).toBe(6);
  });
});
