import { describe, expect, it } from "vitest";

import { countOutsideHours, isOutsideHours } from "./outside-hours";

/**
 * Spec 0007, AC-9. Every instant is UTC; Manila is UTC+8 all year, so
 * 2026-09-16 is a Wednesday and 2026-09-19 is a Saturday at the venue.
 */
const TZ = "Asia/Manila";
type Day = { dayOfWeek: number; open: string | null; close: string | null };

const HOURS: Day[] = [
  { dayOfWeek: 0, open: "06:00", close: "24:00" },
  { dayOfWeek: 1, open: "08:00", close: "22:00" },
  { dayOfWeek: 2, open: "08:00", close: "22:00" },
  { dayOfWeek: 3, open: "08:00", close: "22:00" },
  { dayOfWeek: 4, open: "08:00", close: "22:00" },
  { dayOfWeek: 5, open: "08:00", close: "22:00" },
  { dayOfWeek: 6, open: "06:00", close: "24:00" },
];

/** The same week with one day changed, which is how the per day rules are read. */
function withDay(dayOfWeek: number, patch: Partial<Day>): Day[] {
  return HOURS.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day));
}

/** 4pm to 6pm Manila on Wednesday the 16th. */
const weekdayInside = { startsAt: "2026-09-16T08:00:00Z", endsAt: "2026-09-16T10:00:00Z" };
/** 7am to 8am Manila, starts before the weekday open. */
const weekdayEarly = { startsAt: "2026-09-15T23:00:00Z", endsAt: "2026-09-16T00:00:00Z" };
/** 9pm to 11pm Manila, ends after the weekday close. */
const weekdayLate = { startsAt: "2026-09-16T13:00:00Z", endsAt: "2026-09-16T15:00:00Z" };
/** 11pm to midnight Manila on Saturday the 19th: the end reads as 24:00. */
const weekendToMidnight = { startsAt: "2026-09-19T15:00:00Z", endsAt: "2026-09-19T16:00:00Z" };
/** 11pm Saturday to 1am Sunday Manila: spans two venue days. */
const overnight = { startsAt: "2026-09-19T15:00:00Z", endsAt: "2026-09-19T17:00:00Z" };

describe("isOutsideHours", () => {
  it("keeps a booking inside its weekday pair", () => {
    expect(isOutsideHours(weekdayInside, HOURS, TZ)).toBe(false);
  });

  it("flags a booking that starts before the open", () => {
    expect(isOutsideHours(weekdayEarly, HOURS, TZ)).toBe(true);
  });

  it("flags a booking that ends after the close", () => {
    expect(isOutsideHours(weekdayLate, HOURS, TZ)).toBe(true);
  });

  it("reads an end on the stroke of midnight as 24:00, so it fits a midnight close", () => {
    expect(isOutsideHours(weekendToMidnight, HOURS, TZ)).toBe(false);
    // Saturday the 19th, closing an hour earlier.
    expect(isOutsideHours(weekendToMidnight, withDay(6, { close: "23:00" }), TZ)).toBe(true);
  });

  it("measures against the weekend pair on a Saturday", () => {
    // 6am to 7am Manila on the Saturday: inside the weekend open of 06:00, outside a weekday 08:00.
    const saturdayDawn = { startsAt: "2026-09-18T22:00:00Z", endsAt: "2026-09-18T23:00:00Z" };
    expect(isOutsideHours(saturdayDawn, HOURS, TZ)).toBe(false);
    expect(isOutsideHours(saturdayDawn, withDay(6, { open: "07:00" }), TZ)).toBe(true);
  });

  it("treats a row that spans two venue days as outside", () => {
    expect(isOutsideHours(overnight, HOURS, TZ)).toBe(true);
  });

  it("decides the weekday at the venue, not in UTC", () => {
    // 2026-09-18T20:00Z is Friday in UTC but 4am Saturday in Manila.
    const row = { startsAt: "2026-09-18T20:00:00Z", endsAt: "2026-09-18T21:00:00Z" };
    expect(isOutsideHours(row, withDay(6, { open: "04:00" }), TZ)).toBe(false);
    expect(isOutsideHours(row, withDay(6, { open: "05:00" }), TZ)).toBe(true);
  });
});

describe("countOutsideHours", () => {
  it("counts only the rows outside their own day's hours", () => {
    const rows = [weekdayInside, weekdayEarly, weekdayLate, weekendToMidnight, overnight];
    expect(countOutsideHours(rows, HOURS, TZ)).toBe(3);
  });

  it("is zero for no rows", () => {
    expect(countOutsideHours([], HOURS, TZ)).toBe(0);
  });

  // Spec 0007, AC-9: a closed day has no hours to be inside, so everything on
  // it counts, whatever time it runs at.
  it("counts every booking on a day the proposal marks closed", () => {
    const closedWednesday = withDay(3, { open: null, close: null });
    expect(isOutsideHours(weekdayInside, closedWednesday, TZ)).toBe(true);
    expect(countOutsideHours([weekdayInside], closedWednesday, TZ)).toBe(1);
  });
});
