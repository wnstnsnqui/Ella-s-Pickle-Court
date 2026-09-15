import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Grid } from "@/lib/schedule/grid";

import { ScheduleGrid } from "./schedule-grid";

/**
 * Spec 0006, AC-4: with a clock, rows that have ended are dimmed and still
 * labelled, the Now marker sits before the first row still to come, and
 * without a clock nothing is dimmed and no marker shows.
 */

const row = (label: string, startsAt: string, endsAt: string) => ({
  startsAt,
  endsAt,
  label,
  outOfHours: false,
  cells: [{ courtId: 1, state: "available", blocks: [] }],
});

const grid = {
  date: "2026-09-16",
  timezone: "Asia/Manila",
  openTime: "14:00",
  closeTime: "17:00",
  slotMinutes: 60,
  courts: [{ id: 1, name: "Court 1", note: null, sortOrder: 1 }],
  rows: [
    row("14:00", "2026-09-16T06:00:00Z", "2026-09-16T07:00:00Z"),
    row("15:00", "2026-09-16T07:00:00Z", "2026-09-16T08:00:00Z"),
    row("16:00", "2026-09-16T08:00:00Z", "2026-09-16T09:00:00Z"),
  ],
} as unknown as Grid;

const render = (now?: string) =>
  renderToStaticMarkup(createElement(ScheduleGrid, { view: { kind: "ready", grid }, now }));

describe("ScheduleGrid with a clock", () => {
  it("dims the rows that have ended and marks the first that has not (AC-4)", () => {
    const html = render("2026-09-16T07:20:00Z");
    // The 2pm row ended at 07:00Z; the 3pm row is in progress and carries the marker.
    expect(html.match(/data-past="true"/g)).toHaveLength(2); // the rowheader and its one cell
    expect(html).toContain("Court 1 at 2pm. Available, ended");
    expect(html).toContain("Court 1 at 3pm. Available</span>");
    const marker = html.indexOf("data-now-marker");
    expect(marker).toBeGreaterThan(-1);
    expect(marker).toBeGreaterThan(html.indexOf("2pm"));
    expect(marker).toBeLessThan(html.indexOf(">3pm<"));
    expect(html).toContain(">Now<");
  });

  it("shows no marker once every row has ended", () => {
    const html = render("2026-09-16T10:00:00Z");
    expect(html).not.toContain("data-now-marker");
    expect(html.match(/data-past="true"/g)).toHaveLength(6);
  });

  it("dims nothing and marks nothing without a clock (AC-4)", () => {
    const html = render();
    expect(html).not.toContain("data-past");
    expect(html).not.toContain("data-now-marker");
  });
});
