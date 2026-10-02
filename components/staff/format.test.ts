import { describe, expect, it } from "vitest";

import {
  BOOKING_STATUS_LABEL,
  firstName,
  formatDayOf,
  formatPeso,
  formatRange,
  formatStamp,
  PAYMENT_LABEL,
  staffDisplayName,
  telHref,
  writerLabel,
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
    { userId: "user_a", displayName: "Ella" },
    { userId: "user_leaver", displayName: "Old Staff" },
  ];

  it("resolves an id from the list, a leaver included (AC-7), to their first name", () => {
    expect(staffDisplayName(staff, "user_leaver")).toBe("Old");
  });

  it("falls back to a plain phrase for a missing id or a null writer", () => {
    expect(staffDisplayName(staff, "user_unknown")).toBe("a staff member");
    expect(staffDisplayName(staff, null)).toBe("a staff member");
  });
});

describe("firstName", () => {
  it("takes the first word of a full name", () => {
    expect(firstName("Ella Santos")).toBe("Ella");
    expect(firstName("Ella")).toBe("Ella");
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

describe("the online booking labels (spec 0015, AC-21)", () => {
  const staff = [{ userId: "user_1", displayName: "Ana Cruz" }];

  it("reads online, not a staff member, for a row nobody signed in wrote", () => {
    expect(writerLabel(staff, null, 42)).toBe("online");
    expect(writerLabel(staff, "user_1", 42)).toBe("by Ana");
    expect(writerLabel(staff, null, null)).toBe("by a staff member");
  });

  it("names the three states this feature writes in words", () => {
    expect(BOOKING_STATUS_LABEL.held).toBe("Held, not yet paid");
    expect(BOOKING_STATUS_LABEL.pending_check).toBe("Payment not yet checked");
    expect(BOOKING_STATUS_LABEL.expired).toBe("Expired");
  });
});
