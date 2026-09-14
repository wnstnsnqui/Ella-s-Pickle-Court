import { describe, expect, it } from "vitest";

import {
  formatDayOf,
  formatPeso,
  formatRange,
  formatStamp,
  PAYMENT_LABEL,
  staffDisplayName,
  telHref,
} from "./format";

/** Spec 0005 AC-7 value sourcing: what the details sheet shows, and from where. */

describe("formatDayOf", () => {
  it("names the venue day, not the UTC day, for an early morning booking", () => {
    // 7am Manila on 14 Sep is 23:00Z on 13 Sep. The sheet once said Sun, Sep 13.
    expect(formatDayOf("2026-09-13T23:00:00.000Z", "Asia/Manila")).toBe("Mon, Sep 14");
  });
});

describe("formatPeso and telHref", () => {
  it("formats pesos to two decimals and strips a phone down to digits and a leading plus", () => {
    expect(formatPeso(250.5)).toBe("₱250.50");
    expect(telHref("+63 917 123 4567")).toBe("tel:+639171234567");
    expect(telHref("0917-123-4567")).toBe("tel:09171234567");
  });
});

describe("staffDisplayName", () => {
  const staff = [
    { clerkUserId: "user_a", displayName: "Ella" },
    { clerkUserId: "user_leaver", displayName: "Old Staff" },
  ];

  it("resolves an id from the list, a leaver included (AC-7)", () => {
    expect(staffDisplayName(staff, "user_leaver")).toBe("Old Staff");
  });

  it("falls back to a plain phrase for a missing id or a null writer", () => {
    expect(staffDisplayName(staff, "user_unknown")).toBe("a staff member");
    expect(staffDisplayName(staff, null)).toBe("a staff member");
  });
});

describe("formatRange and formatStamp", () => {
  it("writes a range in the grid's own compact labels, at the venue (AC-7)", () => {
    expect(formatRange("2026-09-15T08:00:00.000Z", "2026-09-15T10:00:00.000Z", "Asia/Manila")).toBe(
      "4pm to 6pm",
    );
    expect(formatRange("2026-09-15T03:30:00.000Z", "2026-09-15T04:00:00.000Z", "Asia/Manila")).toBe(
      "11:30am to 12nn",
    );
  });

  it("stamps a write with the venue day and time", () => {
    expect(formatStamp("2026-09-14T07:38:00.000Z", "Asia/Manila")).toBe("Sep 14, 3:38 PM");
  });

  it("labels every payment status", () => {
    expect(Object.values(PAYMENT_LABEL)).toEqual(["Unpaid", "Partial", "Paid", "Waived"]);
  });
});
