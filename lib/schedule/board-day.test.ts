import { describe, expect, it } from "vitest";

import { boardHref, boardTitle, DEFAULT_TITLE } from "./board-day";

/**
 * Spec 0014, AC-4 and AC-10: the address and the tab title name the day on
 * screen; today drops `date` so the board keeps following the venue's day.
 */

describe("boardTitle", () => {
  it("names the day on a dated board", () => {
    expect(boardTitle("2026-09-29")).toBe("Court schedule for Tue 29 Sep · Ella's Pickle Court");
  });

  it("is the site default on an undated board", () => {
    expect(boardTitle()).toBe(DEFAULT_TITLE);
    expect(DEFAULT_TITLE).toBe("Ella's Pickle Court · Court schedule");
  });
});

describe("boardHref", () => {
  it("sets the day and keeps every other parameter", () => {
    expect(boardHref("https://x.test/schedule?ref=fb&date=2026-09-26", "2026-09-27")).toBe(
      "/schedule?ref=fb&date=2026-09-27",
    );
  });

  it("adds the day to an undated address", () => {
    expect(boardHref("https://x.test/staff", "2026-09-27")).toBe("/staff?date=2026-09-27");
  });

  it("removes the day for today, keeping the rest", () => {
    expect(boardHref("https://x.test/schedule?date=2026-09-27&ref=fb", undefined)).toBe(
      "/schedule?ref=fb",
    );
    expect(boardHref("https://x.test/schedule?date=2026-09-27", undefined)).toBe("/schedule");
  });
});
