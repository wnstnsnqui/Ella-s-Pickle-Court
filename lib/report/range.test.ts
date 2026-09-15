import { describe, expect, it } from "vitest";

import { resolveRange } from "./range";

/** A Tuesday, so "this week" and "last week" both have something to prove. */
const TODAY = "2026-09-15";

describe("resolveRange", () => {
  it("resolves the rolling presets to end today", () => {
    expect(resolveRange("last-7-days", TODAY)).toEqual({ from: "2026-09-09", to: TODAY });
    expect(resolveRange("last-30-days", TODAY)).toEqual({ from: "2026-08-17", to: TODAY });
    expect(resolveRange("last-90-days", TODAY)).toEqual({ from: "2026-06-18", to: TODAY });
  });

  it("runs this week from Monday to today", () => {
    expect(resolveRange("this-week", TODAY)).toEqual({ from: "2026-09-14", to: TODAY });
  });

  it("runs last week Monday to Sunday", () => {
    expect(resolveRange("last-week", TODAY)).toEqual({ from: "2026-09-07", to: "2026-09-13" });
  });

  it("resolves this week to a single day when today is Monday", () => {
    expect(resolveRange("this-week", "2026-09-14")).toEqual({
      from: "2026-09-14",
      to: "2026-09-14",
    });
  });

  it("runs this month from the first to today", () => {
    expect(resolveRange("this-month", TODAY)).toEqual({ from: "2026-09-01", to: TODAY });
  });

  it("runs last month as the full previous calendar month", () => {
    expect(resolveRange("last-month", TODAY)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });

  it("rolls last month back across a year boundary", () => {
    expect(resolveRange("last-month", "2026-01-15")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("starts 12 months back on the first of the month, rolling the year", () => {
    expect(resolveRange("last-12-months", TODAY)).toEqual({ from: "2025-10-01", to: TODAY });
  });
});
