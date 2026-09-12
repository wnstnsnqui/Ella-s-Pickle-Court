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
});
