import { describe, expect, it } from "vitest";

import { commonOpenPair, toHoursInput, toHoursValues } from "./forms";

/**
 * Spec 0007, AC-8: the seven day form, closed as both times absent, and the
 * pair a reopened day starts on.
 */

const settings = {
  days: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    open: dayOfWeek === 1 ? null : "06:00",
    close: dayOfWeek === 1 ? null : dayOfWeek === 5 ? "24:00" : "22:00",
  })),
  slotMinutes: 60,
  bookingHorizonDays: 30,
  timezone: "Asia/Manila",
  version: 4,
};

describe("toHoursValues", () => {
  it("holds a closed day as the toggle on and both selects empty", () => {
    const values = toHoursValues(settings);
    expect(values.days).toHaveLength(7);
    expect(values.days[1]).toEqual({ dayOfWeek: 1, closed: true, open: "", close: "" });
    expect(values.days[5]).toEqual({ dayOfWeek: 5, closed: false, open: "06:00", close: "24:00" });
  });
});

describe("toHoursInput", () => {
  it("sends a closed day as both times null, whatever the selects hold", () => {
    const values = toHoursValues(settings);
    // A stale pair left on a row that has since been marked closed.
    values.days[1] = { dayOfWeek: 1, closed: true, open: "06:00", close: "22:00" };

    const input = toHoursInput(values, settings.version, true);
    expect(input.days[1]).toEqual({ dayOfWeek: 1, open: null, close: null });
    expect(input.days[5]).toEqual({ dayOfWeek: 5, open: "06:00", close: "24:00" });
    expect(input).toMatchObject({ version: 4, slotMinutes: 60, bookingHorizonDays: 30 });
  });
});

describe("commonOpenPair", () => {
  it("is the pair most of the other days run on", () => {
    expect(commonOpenPair(toHoursValues(settings).days)).toEqual({
      open: "06:00",
      close: "22:00",
    });
  });

  it("falls back to 06:00 to 22:00 when every other day is closed too", () => {
    const shut = toHoursValues(settings).days.map((day) => ({
      ...day,
      closed: true,
      open: "",
      close: "",
    }));
    expect(commonOpenPair(shut)).toEqual({ open: "06:00", close: "22:00" });
  });
});
