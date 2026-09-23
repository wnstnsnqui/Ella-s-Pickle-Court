import { describe, expect, it } from "vitest";

import {
  closeTimeSchema,
  createReservationsSchema,
  customerPhoneSchema,
  localTimeSchema,
  reorderCourtsSchema,
  saveCourtSchema,
  saveVenueSettingsSchema,
  updateReservationSchema,
} from "./schemas";

/**
 * The boundary rules spec 0005 added: a whole selection of runs at once, a
 * loose phone rule, and a closure edit that moves its end time alone.
 */

const run = (courtId: number, startTime: string, endTime: string, date = "2026-09-16") => ({
  courtId,
  date,
  startTime,
  endTime,
});

describe("createReservationsSchema", () => {
  it("accepts runs on two courts with one set of customer fields", () => {
    const result = createReservationsSchema.safeParse({
      runs: [run(1, "16:00", "18:00"), run(2, "16:00", "17:00")],
      kind: "booking",
      customerName: "Maria",
    });
    expect(result.success).toBe(true);
  });

  it("refuses a booking without a customer name, and allows a closure without one", () => {
    const booking = createReservationsSchema.safeParse({
      runs: [run(1, "16:00", "17:00")],
      kind: "booking",
    });
    expect(booking.success).toBe(false);
    const closure = createReservationsSchema.safeParse({
      runs: [run(1, "16:00", "17:00")],
      kind: "closed",
    });
    expect(closure.success).toBe(true);
  });

  it("refuses two runs that overlap on the same court, but not on different courts", () => {
    const same = createReservationsSchema.safeParse({
      runs: [run(1, "16:00", "18:00"), run(1, "17:00", "19:00")],
      kind: "closed",
    });
    expect(same.success).toBe(false);
    const touching = createReservationsSchema.safeParse({
      runs: [run(1, "16:00", "18:00"), run(1, "18:00", "19:00")],
      kind: "closed",
    });
    expect(touching.success).toBe(true);
    const other = createReservationsSchema.safeParse({
      runs: [run(1, "16:00", "18:00"), run(2, "17:00", "19:00")],
      kind: "closed",
    });
    expect(other.success).toBe(true);
  });

  it("refuses an empty set, more than twenty runs, and a run that ends before it starts", () => {
    expect(createReservationsSchema.safeParse({ runs: [], kind: "closed" }).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, index) => run(index + 1, "16:00", "17:00"));
    expect(createReservationsSchema.safeParse({ runs: many, kind: "closed" }).success).toBe(false);
    expect(
      createReservationsSchema.safeParse({ runs: [run(1, "17:00", "16:00")], kind: "closed" })
        .success,
    ).toBe(false);
  });
});

describe("customerPhoneSchema", () => {
  it("takes digits, spaces, plus and dashes between 7 and 30 characters", () => {
    expect(customerPhoneSchema.safeParse("+63 917 123 4567").success).toBe(true);
    expect(customerPhoneSchema.safeParse("0917-123-4567").success).toBe(true);
    expect(customerPhoneSchema.safeParse("12345").success).toBe(false);
    expect(customerPhoneSchema.safeParse("call me maybe").success).toBe(false);
  });
});

describe("updateReservationSchema", () => {
  it("accepts an end time on its own for a closure edit", () => {
    const result = updateReservationSchema.safeParse({ id: 4, version: 2, endTime: "19:00" });
    expect(result.success).toBe(true);
  });

  it("still refuses a start time or a date on its own", () => {
    expect(
      updateReservationSchema.safeParse({ id: 4, version: 2, startTime: "19:00" }).success,
    ).toBe(false);
    expect(
      updateReservationSchema.safeParse({ id: 4, version: 2, date: "2026-09-16" }).success,
    ).toBe(false);
    expect(
      updateReservationSchema.safeParse({ id: 4, version: 2, startTime: "18:00", endTime: "19:00" })
        .success,
    ).toBe(false);
  });
});

describe("closeTimeSchema and saveVenueSettingsSchema (spec 0007, AC-8)", () => {
  const base = {
    version: 1,
    days: [
      { dayOfWeek: 0, open: "06:00", close: "23:00" },
      { dayOfWeek: 1, open: "06:00", close: "22:00" },
      { dayOfWeek: 2, open: "06:00", close: "22:00" },
      { dayOfWeek: 3, open: "06:00", close: "22:00" },
      { dayOfWeek: 4, open: "06:00", close: "22:00" },
      { dayOfWeek: 5, open: "06:00", close: "22:00" },
      { dayOfWeek: 6, open: "06:00", close: "23:00" },
    ],
    slotMinutes: 60,
    bookingHorizonDays: 30,
  };

  it("accepts 24:00 as a close and nothing later", () => {
    expect(closeTimeSchema.safeParse("24:00").success).toBe(true);
    expect(closeTimeSchema.safeParse("23:30").success).toBe(true);
    expect(closeTimeSchema.safeParse("24:30").success).toBe(false);
    expect(localTimeSchema.safeParse("24:00").success).toBe(false);
  });

  /** The same week with one day changed, which is how the per day rules are read. */
  const withDay = (dayOfWeek: number, patch: Record<string, string | null>) => ({
    ...base,
    days: base.days.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day)),
  });

  it("lets a day close at midnight but never open there", () => {
    expect(saveVenueSettingsSchema.safeParse(withDay(1, { close: "24:00" })).success).toBe(true);
    expect(saveVenueSettingsSchema.safeParse(withDay(6, { open: "24:00" })).success).toBe(false);
  });

  // Spec 0007, AC-8: a closed day is both times absent, and never one of them.
  it("takes a closed day as both times null and refuses half a day", () => {
    expect(saveVenueSettingsSchema.safeParse(withDay(1, { open: null, close: null })).success).toBe(
      true,
    );
    expect(saveVenueSettingsSchema.safeParse(withDay(1, { close: null })).success).toBe(false);
    expect(saveVenueSettingsSchema.safeParse(withDay(1, { open: null })).success).toBe(false);
  });

  it("wants one row per day of the week, no more and no fewer", () => {
    expect(
      saveVenueSettingsSchema.safeParse({ ...base, days: base.days.slice(0, 6) }).success,
    ).toBe(false);
    expect(
      saveVenueSettingsSchema.safeParse({
        ...base,
        days: [...base.days.slice(0, 6), { ...base.days[5] }],
      }).success,
    ).toBe(false);
  });

  it("carries the acknowledgement for the two step save", () => {
    const parsed = saveVenueSettingsSchema.safeParse({ ...base, acknowledge: true });
    expect(parsed.success && parsed.data.acknowledge).toBe(true);
  });
});

describe("saveCourtSchema and reorderCourtsSchema (spec 0007, AC-3 and AC-5)", () => {
  it("lets a new court omit its position and insists on it for an edit", () => {
    expect(saveCourtSchema.safeParse({ name: "Court 3" }).success).toBe(true);
    const edit = saveCourtSchema.safeParse({ id: 1, version: 1, name: "Court 3" });
    expect(edit.success).toBe(false);
    expect(
      saveCourtSchema.safeParse({ id: 1, version: 1, name: "Court 3", sortOrder: 2 }).success,
    ).toBe(true);
  });

  it("refuses an empty list and a repeated court", () => {
    expect(reorderCourtsSchema.safeParse({ courts: [] }).success).toBe(false);
    expect(
      reorderCourtsSchema.safeParse({
        courts: [
          { id: 1, version: 1 },
          { id: 1, version: 2 },
        ],
      }).success,
    ).toBe(false);
    expect(
      reorderCourtsSchema.safeParse({
        courts: [
          { id: 2, version: 1 },
          { id: 1, version: 4 },
        ],
      }).success,
    ).toBe(true);
  });
});
