import { describe, expect, it } from "vitest";

import { formatPeso } from "@/lib/venue";

import {
  bookingTotal,
  groupPicks,
  hoursChip,
  hoursText,
  isPressable,
  joinWithAnd,
  pickKey,
  pickRuns,
  refundSmsBody,
  runHours,
  runLabel,
  smsBody,
  sortRuns,
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

  it("totals tiles times slot hours times the hourly rate, comma grouped (AC-12)", () => {
    expect(formatPeso(bookingTotal(4, 60, 250))).toBe("₱1,000");
    expect(formatPeso(bookingTotal(3, 30, 250))).toBe("₱375");
    expect(formatPeso(bookingTotal(0, 60, 250))).toBe("₱0");
  });

  it("follows the rate the schedule read carries, not a constant (spec 0015, AC-17)", () => {
    expect(formatPeso(bookingTotal(2, 60, 300))).toBe("₱600");
    expect(formatPeso(bookingTotal(1, 30, 300))).toBe("₱150");
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

/** Spec 0015, AC-13 and AC-14: the receipt's runs, hours and the refund text. */
describe("the receipt", () => {
  const courts = [
    { id: 2, name: "Court 2" },
    { id: 1, name: "Court 1" },
  ];
  const run = (courtId: number, from: string, to: string) => ({
    courtId,
    startsAt: manila(DAY, from),
    endsAt: manila(DAY, to),
    amount: 250,
  });

  it("labels a run in the venue's time, with a midnight end as Midnight", () => {
    expect(runLabel(run(1, "17:00", "19:00"))).toBe("5pm to 7pm");
    expect(
      runLabel({ startsAt: manila(DAY, "23:00"), endsAt: manila("2026-09-27", "00:00") }),
    ).toBe("11pm to Midnight");
  });

  it("adds up the hours", () => {
    expect(runHours([run(1, "17:00", "19:00"), run(2, "06:00", "07:00")])).toBe(3);
  });

  it("lists runs by court in the order the card showed them, then by time", () => {
    expect(
      sortRuns(
        [run(1, "20:00", "21:00"), run(2, "06:00", "07:00"), run(1, "17:00", "18:00")],
        courts.map((court) => court.id),
      ).map(runLabel),
    ).toEqual(["6am to 7am", "5pm to 6pm", "8pm to 9pm"]);
  });

  it("writes the refund text with the code grouped and the digits", () => {
    expect(refundSmsBody("K7MQ3XPT", "1234")).toBe(
      "Hi! My online booking K7MQ-3XPT didn't go through after I paid (reference ending 1234). Can you refund me or move my booking?",
    );
  });
});

/**
 * Spec 0015, AC-1: before the hold answers, the card lists the picks as the
 * hold will write them, adjacent slots on one court merged into one run.
 */
describe("the selected courts and slots", () => {
  const pick = (courtId: number, time: string) => ({ courtId, startsAt: manila(DAY, time) });

  it("merges adjacent picks on one court and keeps a gap as two runs", () => {
    const runs = pickRuns(
      [pick(1, "21:00"), pick(1, "17:00"), pick(1, "22:00"), pick(2, "06:00")],
      60,
      [2, 1],
    );
    expect(runs.map((run) => [run.courtId, runLabel(run)])).toEqual([
      [2, "6am to 7am"],
      [1, "5pm to 6pm"],
      [1, "9pm to 11pm"],
    ]);
    expect(runHours(runs)).toBe(4);
  });

  it("never merges the same hour on two courts", () => {
    expect(pickRuns([pick(1, "17:00"), pick(2, "18:00")], 60, [1, 2])).toHaveLength(2);
  });

  it("ends a run at midnight as Midnight", () => {
    const [run] = pickRuns([pick(1, "23:00")], 60, [1]);
    expect(runLabel(run)).toBe("11pm to Midnight");
  });

  it("follows the slot length", () => {
    const runs = pickRuns([pick(1, "17:00"), pick(1, "17:30")], 30, [1]);
    expect(runs.map(runLabel)).toEqual(["5pm to 6pm"]);
  });

  it.each([
    [1, "1 hour", "1 hr"],
    [3, "3 hours", "3 hr"],
    [1.5, "1.5 hours", "1.5 hr"],
  ])("reads %s hours as %s and %s", (hours, text, chip) => {
    expect(hoursText(hours)).toBe(text);
    expect(hoursChip(hours)).toBe(chip);
  });
});
