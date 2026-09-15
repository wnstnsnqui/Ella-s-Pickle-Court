import { describe, expect, it } from "vitest";

import { buildUsageCsv } from "./csv";
import type { ReportCourt, UsageRow } from "./queries";

/** Spec 0008, AC-9: usage rows only, RFC 4180 quoting, `\r\n` line endings. */

const COURTS: ReportCourt[] = [
  { id: 1, name: "Court 1", sortOrder: 0, retiredAt: null },
  { id: 2, name: "Court 2", sortOrder: 1, retiredAt: null },
];

describe("buildUsageCsv", () => {
  it("writes the header and nothing else for no rows", () => {
    expect(buildUsageCsv([], COURTS)).toBe("court,date,weekday,hour,booked_minutes\r\n");
  });

  it("writes one row per usage row, in court sort order then date then hour", () => {
    const rows: UsageRow[] = [
      { courtId: 2, localDate: "2026-09-17", hour: 9, bookedMinutes: 60 },
      { courtId: 1, localDate: "2026-09-17", hour: 10, bookedMinutes: 30 },
      { courtId: 1, localDate: "2026-09-17", hour: 9, bookedMinutes: 45 },
    ];
    const csv = buildUsageCsv(rows, COURTS);
    const lines = csv.split("\r\n");
    expect(lines).toEqual([
      "court,date,weekday,hour,booked_minutes",
      "Court 1,2026-09-17,Thu,9,45",
      "Court 1,2026-09-17,Thu,10,30",
      "Court 2,2026-09-17,Thu,9,60",
      "",
    ]);
  });

  it("every line ends in \\r\\n, including the last", () => {
    const rows: UsageRow[] = [{ courtId: 1, localDate: "2026-09-17", hour: 9, bookedMinutes: 60 }];
    expect(buildUsageCsv(rows, COURTS).endsWith("\r\n")).toBe(true);
  });

  it("quotes a court name carrying a comma, doubling any inner quote", () => {
    const courts: ReportCourt[] = [
      { id: 1, name: 'Court "A", Main', sortOrder: 0, retiredAt: null },
    ];
    const rows: UsageRow[] = [{ courtId: 1, localDate: "2026-09-17", hour: 9, bookedMinutes: 60 }];
    const csv = buildUsageCsv(rows, courts);
    expect(csv).toContain('"Court ""A"", Main",2026-09-17,Thu,9,60');
  });

  it("falls back to a generic name for a court id with no matching court", () => {
    const rows: UsageRow[] = [{ courtId: 99, localDate: "2026-09-17", hour: 9, bookedMinutes: 60 }];
    expect(buildUsageCsv(rows, COURTS)).toContain("Court 99,2026-09-17,Thu,9,60");
  });

  it("computes the three letter weekday from the local date, not the reader's clock", () => {
    // 2026-09-19 is a Saturday, 2026-09-20 a Sunday.
    const rows: UsageRow[] = [
      { courtId: 1, localDate: "2026-09-19", hour: 9, bookedMinutes: 30 },
      { courtId: 1, localDate: "2026-09-20", hour: 9, bookedMinutes: 30 },
    ];
    const csv = buildUsageCsv(rows, COURTS);
    expect(csv).toContain("2026-09-19,Sat,");
    expect(csv).toContain("2026-09-20,Sun,");
  });

  it("does not mutate the input row order", () => {
    const rows: UsageRow[] = [
      { courtId: 2, localDate: "2026-09-17", hour: 9, bookedMinutes: 60 },
      { courtId: 1, localDate: "2026-09-17", hour: 9, bookedMinutes: 30 },
    ];
    const original = [...rows];
    buildUsageCsv(rows, COURTS);
    expect(rows).toEqual(original);
  });
});
