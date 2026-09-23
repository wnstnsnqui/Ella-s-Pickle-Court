import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Architecture rule 8 and the Time row of spec 0001: instants are stored as UTC
 * and only ever displayed at the venue, `Asia/Manila`, never the reader's device.
 *
 * The module reads the timezone once at import, so each test imports it fresh.
 */

async function loadTime(venueTimezone?: string) {
  vi.resetModules();
  if (venueTimezone === undefined) {
    delete process.env.NEXT_PUBLIC_VENUE_TIMEZONE;
  } else {
    process.env.NEXT_PUBLIC_VENUE_TIMEZONE = venueTimezone;
  }
  return import("./time");
}

const original = process.env.NEXT_PUBLIC_VENUE_TIMEZONE;

beforeEach(() => {
  process.env.TZ = "UTC";
});

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_VENUE_TIMEZONE;
  else process.env.NEXT_PUBLIC_VENUE_TIMEZONE = original;
  vi.resetModules();
});

describe("formatAtVenue", () => {
  it("shows a UTC instant as the venue's local time, eight hours ahead", async () => {
    const { formatAtVenue } = await loadTime("Asia/Manila");
    expect(formatAtVenue("2026-09-03T04:11:17.215Z")).toBe("12:11 PM");
  });

  it("accepts a Date as well as an ISO string, for the same instant", async () => {
    const { formatAtVenue } = await loadTime("Asia/Manila");
    const instant = "2026-09-03T04:11:17.215Z";
    expect(formatAtVenue(new Date(instant))).toBe(formatAtVenue(instant));
  });

  it("ignores the reader's device timezone", async () => {
    const { formatAtVenue } = await loadTime("Asia/Manila");
    const instant = "2026-09-03T04:11:17.215Z";
    const asUtcReader = formatAtVenue(instant);

    // A staff member opening the board from another timezone must still read the
    // venue's clock. This is the whole point of rule 8.
    process.env.TZ = "America/New_York";
    expect(formatAtVenue(instant)).toBe(asUtcReader);
  });

  it("rolls the date correctly when Manila is already on the next day", async () => {
    const { formatAtVenue } = await loadTime("Asia/Manila");
    // 17:30 UTC is 01:30 the following morning in Manila.
    expect(
      formatAtVenue("2026-09-03T17:30:00.000Z", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }),
    ).toContain("4");
  });

  it("honours caller supplied format options", async () => {
    const { formatAtVenue } = await loadTime("Asia/Manila");
    expect(
      formatAtVenue("2026-09-03T04:11:17.215Z", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }),
    ).toBe("12:11:17 PM");
  });

  it("falls back to Asia/Manila when no timezone is configured", async () => {
    const { formatAtVenue, VENUE_TIMEZONE } = await loadTime(undefined).then(async (m) => ({
      ...m,
      ...(await import("./env")),
    }));
    expect(VENUE_TIMEZONE).toBe("Asia/Manila");
    expect(formatAtVenue("2026-09-03T04:11:17.215Z")).toBe("12:11 PM");
  });

  it("uses a configured timezone other than the default when one is set", async () => {
    const { formatAtVenue } = await loadTime("UTC");
    expect(formatAtVenue("2026-09-03T04:11:17.215Z")).toBe("4:11 AM");
  });
});

describe("formatSlotLabel", () => {
  /**
   * Spec 0003, AC-9. The label comes in as venue local `HH:mm` from
   * `GridRow.label`, so this is pure formatting: no timezone, no clock.
   */
  it("drops the minutes on the hour", async () => {
    const { formatSlotLabel } = await loadTime();
    expect(formatSlotLabel("09:00")).toBe("9am");
    expect(formatSlotLabel("16:00")).toBe("4pm");
    expect(formatSlotLabel("23:00")).toBe("11pm");
  });

  it("reads noon as 12nn and midnight as 12mn", async () => {
    const { formatSlotLabel } = await loadTime();
    expect(formatSlotLabel("12:00")).toBe("12nn");
    expect(formatSlotLabel("00:00")).toBe("12mn");
  });

  it("keeps the minutes on a half hour slot, on both sides of noon", async () => {
    const { formatSlotLabel } = await loadTime();
    expect(formatSlotLabel("16:30")).toBe("4:30pm");
    expect(formatSlotLabel("09:15")).toBe("9:15am");
    expect(formatSlotLabel("12:30")).toBe("12:30pm");
    expect(formatSlotLabel("00:30")).toBe("12:30am");
  });

  it("refuses something that is not a local time", async () => {
    const { formatSlotLabel } = await loadTime();
    expect(() => formatSlotLabel("teatime")).toThrow(RangeError);
  });

  it("reads 24:00, the end of the day, as Midnight (spec 0007, AC-8)", async () => {
    const { formatSlotLabel } = await loadTime();
    expect(formatSlotLabel("24:00")).toBe("Midnight");
  });
});

describe("midnight as an end (spec 0007, AC-10)", () => {
  it("resolves 24:00 to the first instant of the next local day", async () => {
    const { zonedTimeToUtc } = await loadTime();
    expect(zonedTimeToUtc("2026-09-16", "24:00", "Asia/Manila").toISOString()).toBe(
      "2026-09-16T16:00:00.000Z",
    );
    expect(zonedTimeToUtc("2026-09-16", "24:00", "Asia/Manila").getTime()).toBe(
      zonedTimeToUtc("2026-09-17", "00:00", "Asia/Manila").getTime(),
    );
  });

  it("still refuses anything else past 23:59", async () => {
    const { zonedTimeToUtc } = await loadTime();
    expect(() => zonedTimeToUtc("2026-09-16", "24:30", "Asia/Manila")).toThrow(RangeError);
    expect(() => zonedTimeToUtc("2026-09-16", "25:00", "Asia/Manila")).toThrow(RangeError);
  });

  it("reads an end on the stroke of midnight as 24:00, and any other end as itself", async () => {
    const { localEndTimeInZone, localTimeInZone } = await loadTime();
    expect(localEndTimeInZone("2026-09-16T16:00:00Z", "Asia/Manila")).toBe("24:00");
    expect(localTimeInZone("2026-09-16T16:00:00Z", "Asia/Manila")).toBe("00:00");
    expect(localEndTimeInZone("2026-09-16T14:00:00Z", "Asia/Manila")).toBe("22:00");
  });
});

describe("localTimeInZone", () => {
  /** Spec 0005: a run's end and a closure's end options travel as venue local `HH:mm`. */
  it("reads an instant as the venue's HH:mm, on both sides of midnight", async () => {
    const { localTimeInZone } = await loadTime();
    expect(localTimeInZone("2026-09-15T08:00:00.000Z", "Asia/Manila")).toBe("16:00");
    expect(localTimeInZone(new Date("2026-09-15T23:30:00.000Z"), "Asia/Manila")).toBe("07:30");
  });

  it("uses a 24 hour clock with a leading zero", async () => {
    const { localTimeInZone } = await loadTime();
    expect(localTimeInZone("2026-09-15T16:00:00.000Z", "Asia/Manila")).toBe("00:00");
  });
});

describe("calendarDateToLocalDate and localDateToCalendarDate (spec 0011, AC-2)", () => {
  it("round trips a calendar date through the local Date identity react-day-picker compares by", async () => {
    const { calendarDateToLocalDate, localDateToCalendarDate } = await loadTime();
    expect(localDateToCalendarDate(calendarDateToLocalDate("2026-09-20"))).toBe("2026-09-20");
    expect(localDateToCalendarDate(calendarDateToLocalDate("2026-01-01"))).toBe("2026-01-01");
    expect(localDateToCalendarDate(calendarDateToLocalDate("2026-12-31"))).toBe("2026-12-31");
  });

  it("reads the picked day back from a device west of the venue without shifting a day", async () => {
    // A device on this clock reads the same wall time react-day-picker itself would
    // have shown, regardless of what the venue's own zone is doing at that instant.
    process.env.TZ = "America/Los_Angeles";
    const { calendarDateToLocalDate, localDateToCalendarDate } = await loadTime();
    const picked = calendarDateToLocalDate("2026-09-20");
    expect(picked.getHours()).toBe(0);
    expect(localDateToCalendarDate(picked)).toBe("2026-09-20");
  });
});

describe("formatDayHeading", () => {
  it("names the weekday, day and month from the calendar date alone (spec 0006, AC-11)", async () => {
    const { formatDayHeading } = await loadTime();
    expect(formatDayHeading("2026-09-20")).toBe("Sun 20 Sep");
    expect(formatDayHeading("2026-01-01")).toBe("Thu 1 Jan");
  });

  it("refuses something that is not a date", async () => {
    const { formatDayHeading } = await loadTime();
    expect(() => formatDayHeading("nope")).toThrow(RangeError);
  });
});

describe("dayOfWeek (spec 0007, AC-16, AC-18)", () => {
  it("numbers Sunday as 0 through Saturday as 6, the way Postgres and getUTCDay do", async () => {
    const { dayOfWeek } = await loadTime();
    // 2026-09-20 is a Sunday, so the week that follows it walks 0 to 6.
    expect(dayOfWeek("2026-09-20")).toBe(0);
    expect(dayOfWeek("2026-09-21")).toBe(1);
    expect(dayOfWeek("2026-09-22")).toBe(2);
    expect(dayOfWeek("2026-09-23")).toBe(3);
    expect(dayOfWeek("2026-09-24")).toBe(4);
    expect(dayOfWeek("2026-09-25")).toBe(5);
    expect(dayOfWeek("2026-09-26")).toBe(6);
  });

  it("reads the calendar date itself, so the machine's own zone cannot shift it", async () => {
    const { dayOfWeek } = await loadTime();
    // A date names its weekday on its own; no zone is involved once you have it.
    process.env.TZ = "Pacific/Kiritimati";
    expect(dayOfWeek("2026-09-25")).toBe(5);
    process.env.TZ = "Pacific/Midway";
    expect(dayOfWeek("2026-09-25")).toBe(5);
  });

  it("crosses a month and a year boundary without drifting", async () => {
    const { dayOfWeek } = await loadTime();
    expect(dayOfWeek("2026-10-01")).toBe(4);
    expect(dayOfWeek("2027-01-01")).toBe(5);
    expect(dayOfWeek("2028-02-29")).toBe(2);
  });
});
