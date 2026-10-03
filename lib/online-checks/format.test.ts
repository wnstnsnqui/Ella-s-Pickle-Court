import { describe, expect, it } from "vitest";

import {
  formatAmount,
  formatEventStamp,
  formatRun,
  formatRunForToast,
  formatRunStart,
  mergeRuns,
  moreRuns,
} from "./format";

/** Spec 0016: how a run, a time and an amount read, always in the venue's zone. */

const TZ = "Asia/Manila";
// 18:00 to 20:00 in Manila, a Friday.
const run = {
  courtId: 2,
  courtName: "Court 2",
  startsAt: "2026-10-30T10:00:00Z",
  endsAt: "2026-10-30T12:00:00Z",
};

describe("formatting a run", () => {
  it("reads Court 2 · Fri 30 Oct · 6pm to 8pm in the list and the sheet", () => {
    expect(formatRun(run, TZ)).toBe("Court 2 · Fri 30 Oct · 6pm to 8pm");
  });

  it("reads Fri 30 Oct, 6pm in the message and Court 2, Fri 30 Oct, 6pm in the toast", () => {
    expect(formatRunStart(run, TZ)).toBe("Fri 30 Oct, 6pm");
    expect(formatRunForToast(run, TZ)).toBe("Court 2, Fri 30 Oct, 6pm");
  });

  it("puts a run ending at midnight on its own day, ending at Midnight", () => {
    const late = { ...run, startsAt: "2026-10-30T15:00:00Z", endsAt: "2026-10-30T16:00:00Z" };
    expect(formatRun(late, TZ)).toBe("Court 2 · Fri 30 Oct · 11pm to Midnight");
  });

  it("stamps a decision in the venue's zone", () => {
    expect(formatEventStamp("2026-10-31T01:05:00Z", TZ)).toBe("Sat 31 Oct, 9:05am");
  });
});

describe("formatAmount", () => {
  it("shows whole pesos without centavos and keeps centavos when there are any", () => {
    expect(formatAmount(1000)).toBe("₱1,000");
    expect(formatAmount(500.5)).toBe("₱500.50");
  });
});

describe("mergeRuns", () => {
  it("joins rows on one court that meet end to start, and sorts earliest first", () => {
    const merged = mergeRuns([
      {
        ...run,
        courtId: 1,
        courtName: "Court 1",
        startsAt: "2026-10-30T11:00:00Z",
        endsAt: "2026-10-30T12:00:00Z",
      },
      {
        ...run,
        courtId: 1,
        courtName: "Court 1",
        startsAt: "2026-10-30T10:00:00Z",
        endsAt: "2026-10-30T11:00:00Z",
      },
      run,
    ]);
    expect(merged).toEqual([
      {
        courtId: 1,
        courtName: "Court 1",
        startsAt: "2026-10-30T10:00:00Z",
        endsAt: "2026-10-30T12:00:00Z",
      },
      run,
    ]);
    expect(moreRuns(merged)).toBe("+1 more");
    expect(moreRuns([run])).toBeNull();
  });
});
