import { describe, expect, it } from "vitest";

import { daysLabel, earliestOpen, groupOpeningHours, hoursLabel } from "./hours";

/**
 * Spec 0013, AC-16 and AC-18: the Visit card lists the week Monday first,
 * days sharing times merged, closed days as Closed; the hero's earliest serve
 * is the minimum opening across open days, and absent when none is open.
 */

type Day = { dayOfWeek: number; open: string | null; close: string | null };

const week = (open: string, close: string): Day[] =>
  [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, open, close }));

const set = (days: Day[], dayOfWeek: number, open: string | null, close: string | null) =>
  days.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, open, close } : day));

const rows = (days: Day[]) =>
  groupOpeningHours(days).map((group) => [daysLabel(group.days), hoursLabel(group)]);

describe("the Visit card's hours", () => {
  it("reads a uniform week as one row", () => {
    expect(rows(week("06:00", "22:00"))).toEqual([["Monday to Sunday", "6am to 10pm"]]);
  });

  it("splits weekdays from a later weekend", () => {
    let days = week("06:00", "22:00");
    days = set(days, 6, "06:00", "23:00");
    days = set(days, 0, "06:00", "23:00");
    expect(rows(days)).toEqual([
      ["Monday to Friday", "6am to 10pm"],
      ["Saturday and Sunday", "6am to 11pm"],
    ]);
  });

  it("reads a closed day as Closed and a midnight close as Midnight", () => {
    let days = week("06:00", "24:00");
    days = set(days, 1, null, null);
    expect(rows(days)).toEqual([
      ["Monday", "Closed"],
      ["Tuesday to Sunday", "6am to Midnight"],
    ]);
  });

  it("merges days that share times even when they are apart", () => {
    let days = week("06:00", "22:00");
    days = set(days, 2, "07:00", "22:00");
    days = set(days, 4, "07:00", "22:00");
    expect(rows(days)).toEqual([
      ["Monday, Wednesday and Friday to Sunday", "6am to 10pm"],
      ["Tuesday and Thursday", "7am to 10pm"],
    ]);
  });

  it("trims Postgres seconds", () => {
    expect(rows(week("06:00:00", "22:00:00"))).toEqual([["Monday to Sunday", "6am to 10pm"]]);
  });
});

describe("earliestOpen", () => {
  it("is the earliest opening across open days", () => {
    expect(earliestOpen(set(week("07:00", "22:00"), 3, "05:30", "22:00"))).toBe("05:30");
  });

  it("ignores a closed day", () => {
    expect(earliestOpen(set(week("07:00", "22:00"), 3, null, null))).toBe("07:00");
  });

  it("is null when every day is closed (AC-16)", () => {
    expect(
      earliestOpen(week("06:00", "22:00").map((d) => ({ ...d, open: null, close: null }))),
    ).toBeNull();
  });
});
