import { describe, expect, it } from "vitest";

import { formatPeso } from "@/lib/venue";

import {
  bookingTotal,
  groupPicks,
  isPressable,
  joinWithAnd,
  pickKey,
  smsBody,
  tileView,
} from "./booking";
import { manila, scheduleFixture } from "./test-fixture";

/**
 * Spec 0013, AC-4, AC-12 and AC-13: the five tile views, the picks grouped by
 * court in sort order, the total at ₱250 an hour, and the prefilled text.
 */

const DAY = "2026-09-26";
const NOW = Date.parse(manila(DAY, "15:12"));
const row = (time: string) => ({ endsAt: manila(DAY, time) });

describe("tileView", () => {
  it.each([
    ["available", false, "16:00", "free"],
    ["available", true, "16:00", "selected"],
    ["booked", false, "16:00", "booked"],
    ["unavailable", false, "16:00", "closed"],
    ["available", false, "15:00", "past"],
    ["booked", false, "15:00", "past"],
  ] as const)("a %s cell (picked %s) ending %s reads %s", (state, picked, end, view) => {
    expect(tileView({ state }, row(end), NOW, picked)).toBe(view);
  });

  it("lets only Free and Selected be pressed", () => {
    expect(
      ["free", "selected", "booked", "closed", "past"].map((v) => isPressable(v as never)),
    ).toEqual([true, true, false, false, false]);
  });
});

describe("the summary", () => {
  const { grid } = scheduleFixture();
  const at = (time: string) => manila(DAY, time);
  const picks = new Set([
    pickKey(2, at("19:00")),
    pickKey(1, at("18:00")),
    pickKey(1, at("17:00")),
  ]);

  it("groups picks by court in sort order, hours in time order (AC-12)", () => {
    expect(groupPicks(grid, picks).map((g) => `${g.court.name}: ${g.labels.join(", ")}`)).toEqual([
      "Court 1: 5pm, 6pm",
      "Court 2: 7pm",
    ]);
  });

  it("totals tiles times slot hours times ₱250, comma grouped (AC-12)", () => {
    expect(formatPeso(bookingTotal(4, 60))).toBe("₱1,000");
    expect(formatPeso(bookingTotal(3, 30))).toBe("₱375");
    expect(formatPeso(bookingTotal(0, 60))).toBe("₱0");
  });

  it("writes the text message with the same grouping (AC-13)", () => {
    expect(smsBody("Sat 26 Sep", groupPicks(grid, picks))).toBe(
      "Hi! Can I book Court 1 at 5pm and 6pm, Court 2 at 7pm on Sat 26 Sep?",
    );
  });

  it("joins three hours with commas and a final and", () => {
    expect(joinWithAnd(["5pm", "6pm", "7pm"])).toBe("5pm, 6pm and 7pm");
    expect(joinWithAnd(["5pm"])).toBe("5pm");
  });
});
