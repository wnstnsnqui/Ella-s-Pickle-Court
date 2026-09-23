import { describe, expect, it } from "vitest";

import { cellKey } from "@/components/schedule/cell-key";
import { buildGrid, type Grid } from "./grid";
import {
  describeSummary,
  EMPTY_SELECTION,
  isSelectable,
  keysInRange,
  pruneSelection,
  selectionRuns,
  summarizeRuns,
  toggleSelection,
  toReservationRuns,
} from "./selection";

/**
 * Spec 0005, AC-3 and AC-6: the selection is a set of cell keys, runs are
 * derived from it by court and by gap, and a refetch prunes whatever stopped
 * being Available.
 */

const SETTINGS = {
  days: [
    { dayOfWeek: 0, open: "08:00", close: "12:00" },
    { dayOfWeek: 1, open: "08:00", close: "12:00" },
    { dayOfWeek: 2, open: "08:00", close: "12:00" },
    { dayOfWeek: 3, open: "08:00", close: "12:00" },
    { dayOfWeek: 4, open: "08:00", close: "12:00" },
    { dayOfWeek: 5, open: "08:00", close: "12:00" },
    { dayOfWeek: 6, open: "08:00", close: "12:00" },
  ],
  slotMinutes: 60,
  bookingHorizonDays: 14,
  timezone: "Asia/Manila",
  version: 1,
};

const COURTS = [
  { id: 1, name: "Court 1", note: null, sortOrder: 1 },
  { id: 2, name: "Court 2", note: null, sortOrder: 2 },
];

/** A Wednesday with four slots, 8am to 12nn at the venue. */
function grid(blocks: Parameters<typeof buildGrid>[0]["blocks"] = []): Grid {
  return buildGrid({ date: "2026-09-16", settings: SETTINGS, courts: COURTS, blocks });
}

const at = (label: string) => `2026-09-16T${label}:00.000Z`;
// Manila is UTC+8, so 8am local is 00:00Z.
const key = (courtId: number, hourLocal: number) =>
  cellKey(courtId, at(`${String(hourLocal - 8).padStart(2, "0")}:00`));

const NONE: ReadonlySet<string> = new Set();

describe("toggleSelection", () => {
  it("adds a key that is not in, and removes one that is", () => {
    const once = toggleSelection(EMPTY_SELECTION, key(1, 8));
    expect([...once]).toEqual([key(1, 8)]);
    const twice = toggleSelection(once, key(1, 8));
    expect(twice.size).toBe(0);
  });

  it("never mutates the set it was given", () => {
    const original = new Set([key(1, 8)]);
    toggleSelection(original, key(1, 9));
    expect(original.size).toBe(1);
  });
});

describe("isSelectable", () => {
  it("allows an Available cell inside opening hours", () => {
    expect(isSelectable(grid(), key(1, 8), NONE)).toBe(true);
  });

  it("refuses a Booked cell, a locked cell, and a cell that is not on the grid", () => {
    const g = grid([{ courtId: 1, startsAt: at("00:00"), endsAt: at("01:00"), kind: "booking" }]);
    expect(isSelectable(g, key(1, 8), NONE)).toBe(false);
    expect(isSelectable(g, key(2, 8), new Set([key(2, 8)]))).toBe(false);
    expect(isSelectable(g, cellKey(9, at("00:00")), NONE)).toBe(false);
  });

  it("refuses an out of hours row even where nothing is booked on that court", () => {
    // A booking at 5am puts an out of hours row on the grid; court 2 reads
    // Unavailable there because the venue is shut, not because it is booked.
    const g = grid([{ courtId: 1, startsAt: at("21:00"), endsAt: at("22:00"), kind: "booking" }]);
    const early = g.rows.find((row) => row.outOfHours);
    expect(early).toBeDefined();
    expect(isSelectable(g, cellKey(2, early!.startsAt), NONE)).toBe(false);
  });
});

describe("selectionRuns", () => {
  it("turns a scattered selection across two courts into runs in court order", () => {
    const selection = new Set([key(2, 8), key(1, 9), key(1, 8)]);
    const runs = selectionRuns(selection, grid());

    expect(runs.map((run) => [run.courtId, run.startTime, run.endTime])).toEqual([
      [1, "08:00", "10:00"],
      [2, "08:00", "09:00"],
    ]);
    expect(runs[0].keys).toEqual([key(1, 8), key(1, 9)]);
    expect(runs[0].minutes).toBe(120);
    expect(runs[0].date).toBe("2026-09-16");
    expect(runs[0].courtName).toBe("Court 1");
  });

  it("splits on a gap, so two hours with a free one between are two runs", () => {
    const runs = selectionRuns(new Set([key(1, 8), key(1, 10)]), grid());
    expect(runs.map((run) => [run.startTime, run.endTime])).toEqual([
      ["08:00", "09:00"],
      ["10:00", "11:00"],
    ]);
  });

  it("ignores a key whose row is not on this grid", () => {
    expect(selectionRuns(new Set([cellKey(1, at("20:00"))]), grid())).toEqual([]);
  });

  it("hands the action only the four fields it validates", () => {
    const runs = selectionRuns(new Set([key(1, 8)]), grid());
    expect(toReservationRuns(runs)).toEqual([
      { courtId: 1, date: "2026-09-16", startTime: "08:00", endTime: "09:00" },
    ]);
  });
});

describe("pruneSelection", () => {
  it("drops the cells a refetch made Booked and keeps the rest", () => {
    const selection = new Set([key(1, 8), key(1, 9), key(2, 8)]);
    const fresh = grid([
      { courtId: 1, startsAt: at("00:00"), endsAt: at("01:00"), kind: "booking" },
    ]);
    const { kept, removed } = pruneSelection(selection, fresh, NONE);
    expect(removed).toEqual([key(1, 8)]);
    expect([...kept].sort()).toEqual([key(1, 9), key(2, 8)].sort());
  });

  it("drops a cell that became locked", () => {
    const { kept, removed } = pruneSelection(new Set([key(1, 8)]), grid(), new Set([key(1, 8)]));
    expect(kept.size).toBe(0);
    expect(removed).toEqual([key(1, 8)]);
  });
});

describe("summarizeRuns and describeSummary", () => {
  it("counts hours across runs and distinct courts", () => {
    const runs = selectionRuns(new Set([key(1, 8), key(1, 9), key(2, 8)]), grid());
    expect(summarizeRuns(runs)).toEqual({ hours: 3, courts: 2 });
    expect(describeSummary({ hours: 3, courts: 2 })).toBe("3 hours on 2 courts");
  });

  it("speaks singular, and half hours, honestly", () => {
    expect(describeSummary({ hours: 1, courts: 1 })).toBe("1 hour on 1 court");
    expect(describeSummary({ hours: 1.5, courts: 1 })).toBe("1.5 hours on 1 court");
  });
});

/**
 * Spec 0007, AC-19: on a closed day no cell can be tapped, so Add booking
 * names a court, a start and an end. This is what turns that range back into
 * the keys the ordinary write path already takes.
 */
describe("keysInRange", () => {
  /** A closed Wednesday: the same four slots, every one of them out of hours. */
  const closed = () =>
    buildGrid({
      date: "2026-09-16",
      settings: {
        ...SETTINGS,
        days: SETTINGS.days.map((day) =>
          day.dayOfWeek === 3 ? { dayOfWeek: 3, open: null, close: null } : day,
        ),
      },
      closedDaySpan: { open: "08:00", close: "12:00" },
      courts: COURTS,
      blocks: [],
    });

  it("returns one key per whole slot the range covers, on that court only", () => {
    const keys = keysInRange(closed(), 1, at("00:00"), at("02:00"));
    expect([...keys].sort()).toEqual([key(1, 8), key(1, 9)].sort());
  });

  it("takes rows that lie outside opening hours, which is every row on a closed day", () => {
    const grid = closed();
    expect(grid.closed).toBe(true);
    expect(grid.rows.every((row) => row.outOfHours)).toBe(true);
    expect(keysInRange(grid, 1, at("00:00"), at("04:00")).size).toBe(4);
  });

  it("leaves out a row the range only partly covers", () => {
    // 8:30am to 9:30am local covers neither whole slot.
    expect(keysInRange(closed(), 1, at("00:30"), at("01:30")).size).toBe(0);
  });

  it("is empty when the range falls outside every row", () => {
    expect(keysInRange(closed(), 1, at("20:00"), at("21:00")).size).toBe(0);
  });

  it("feeds selectionRuns, so a typed range becomes one ordinary run", () => {
    const grid = closed();
    const runs = selectionRuns(keysInRange(grid, 2, at("00:00"), at("03:00")), grid);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      courtId: 2,
      courtName: "Court 2",
      date: "2026-09-16",
      startTime: "08:00",
      endTime: "11:00",
      minutes: 180,
    });
  });
});
