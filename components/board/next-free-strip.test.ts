import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Grid } from "@/lib/schedule/grid";

import { NextFreeStrip } from "./next-free-strip";

/**
 * Spec 0006, AC-3: one line per court in sort order, reading Free now, Free
 * from a label, or Nothing free today, as text a screen reader reads.
 */

const row = (label: string, startsAt: string, endsAt: string, states: string[]) => ({
  startsAt,
  endsAt,
  label,
  outOfHours: false,
  cells: states.map((state, index) => ({ courtId: index + 1, state, blocks: [] })),
});

const grid = {
  date: "2026-09-16",
  timezone: "Asia/Manila",
  openTime: "14:00",
  closeTime: "17:00",
  slotMinutes: 60,
  courts: [
    { id: 1, name: "Court 1", note: null, sortOrder: 1 },
    { id: 2, name: "Court 2", note: null, sortOrder: 2 },
    { id: 3, name: "Court 3", note: null, sortOrder: 3 },
  ],
  rows: [
    row("14:00", "2026-09-16T06:00:00Z", "2026-09-16T07:00:00Z", [
      "booked",
      "available",
      "unavailable",
    ]),
    row("15:00", "2026-09-16T07:00:00Z", "2026-09-16T08:00:00Z", [
      "available",
      "booked",
      "unavailable",
    ]),
    row("16:00", "2026-09-16T08:00:00Z", "2026-09-16T09:00:00Z", [
      "booked",
      "booked",
      "unavailable",
    ]),
  ],
} as unknown as Grid;

describe("NextFreeStrip", () => {
  it("reads Free now, Free from, and Nothing free today per court (AC-3)", () => {
    // 14:30 at the venue: court 2 is free in the current slot, court 1 at 3pm, court 3 never.
    const now = Date.parse("2026-09-16T06:30:00Z");
    const html = renderToStaticMarkup(createElement(NextFreeStrip, { grid, now }));
    const items = html.match(/<li[^>]*>.*?<\/li>/g) ?? [];
    expect(items).toHaveLength(3);
    expect(items[0]).toContain("Court 1");
    expect(items[0]).toContain("Free from 3pm");
    expect(items[1]).toContain("Court 2");
    expect(items[1]).toContain("Free now");
    expect(items[2]).toContain("Court 3");
    expect(items[2]).toContain("Nothing free today");
    expect(html).toContain('aria-label="Next free slot on each court"');
  });

  it("moves on once the current slot has ended", () => {
    const now = Date.parse("2026-09-16T07:10:00Z");
    const html = renderToStaticMarkup(createElement(NextFreeStrip, { grid, now }));
    const items = html.match(/<li[^>]*>.*?<\/li>/g) ?? [];
    expect(items[0]).toContain("Free now");
    expect(items[1]).toContain("Nothing free today");
  });
});
