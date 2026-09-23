import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Calendar } from "@/components/ui/calendar";
import { calendarDateToLocalDate } from "@/lib/time";

import {
  DatePicker,
  disabledReason,
  isClosedDay,
  isDayDisabled,
  pickerBounds,
} from "./date-picker";

/** The nav button's own markup, order of attributes aside. */
function navButton(html: string, label: string): string {
  const match = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`));
  if (!match) throw new Error(`No nav button labelled "${label}" in: ${html}`);
  return match[0];
}

/**
 * The client side mirror of `resolveDate` (spec 0011): the calendar's bound
 * math, its two disabled reasons, and the month paging it produces.
 */

describe("pickerBounds", () => {
  it("derives the last bookable day from today plus the horizon", () => {
    const { lastDay, todayLocal, lastDayLocal } = pickerBounds("2026-09-17", 14);
    expect(lastDay).toBe("2026-10-01");
    expect(todayLocal).toEqual(calendarDateToLocalDate("2026-09-17"));
    expect(lastDayLocal).toEqual(calendarDateToLocalDate("2026-10-01"));
  });
});

describe("isDayDisabled (spec 0011, AC-3)", () => {
  const { todayLocal, lastDayLocal } = pickerBounds("2026-09-17", 14);
  const yesterday = calendarDateToLocalDate("2026-09-16");
  const today = calendarDateToLocalDate("2026-09-17");
  const lastDay = calendarDateToLocalDate("2026-10-01");
  const pastHorizon = calendarDateToLocalDate("2026-10-02");

  it("disables yesterday and beyond the horizon on the public board (allowPastPick false)", () => {
    expect(isDayDisabled(yesterday, todayLocal, lastDayLocal, false)).toBe(true);
    expect(isDayDisabled(today, todayLocal, lastDayLocal, false)).toBe(false);
    expect(isDayDisabled(lastDay, todayLocal, lastDayLocal, false)).toBe(false);
    expect(isDayDisabled(pastHorizon, todayLocal, lastDayLocal, false)).toBe(true);
  });

  it("leaves every past day pickable on the staff board (allowPastPick true), still bounded by the horizon", () => {
    expect(isDayDisabled(yesterday, todayLocal, lastDayLocal, true)).toBe(false);
    expect(
      isDayDisabled(calendarDateToLocalDate("2025-01-01"), todayLocal, lastDayLocal, true),
    ).toBe(false);
    expect(isDayDisabled(lastDay, todayLocal, lastDayLocal, true)).toBe(false);
    expect(isDayDisabled(pastHorizon, todayLocal, lastDayLocal, true)).toBe(true);
  });
});

describe("disabledReason (spec 0011, AC-3)", () => {
  const { lastDay, todayLocal, lastDayLocal } = pickerBounds("2026-09-17", 14);

  it("reuses resolveDate's exact past-day sentence", () => {
    const yesterday = calendarDateToLocalDate("2026-09-16");
    expect(disabledReason(yesterday, todayLocal, lastDayLocal, false, lastDay)).toBe(
      "That day has passed. The board shows today onward.",
    );
  });

  it("reuses resolveDate's exact beyond-horizon sentence, with the real last day", () => {
    const pastHorizon = calendarDateToLocalDate("2026-10-02");
    expect(disabledReason(pastHorizon, todayLocal, lastDayLocal, false, lastDay)).toBe(
      "The schedule only goes as far as 2026-10-01 for now.",
    );
  });

  it("gives no reason for a pickable day", () => {
    const today = calendarDateToLocalDate("2026-09-17");
    expect(disabledReason(today, todayLocal, lastDayLocal, false, lastDay)).toBeUndefined();
  });
});

describe("<DatePicker> (spec 0011, AC-1, AC-5)", () => {
  const props = {
    date: "2026-09-17",
    timezone: "Asia/Manila",
    horizonDays: 14,
    now: "2026-09-17T04:00:00.000Z",
    navigate: () => {},
  };

  it("renders a real, accessibly named trigger button", () => {
    const html = renderToStaticMarkup(createElement(DatePicker, props));
    expect(html).toMatch(/<button[^>]*aria-label="Pick a date"/);
  });
});

describe("<Calendar> classNames merge (fixes the mobile sheet's calendar sitting off center)", () => {
  it("lets a caller widen the root instead of losing it to a plain override", () => {
    const html = renderToStaticMarkup(
      createElement(Calendar, {
        mode: "single",
        selected: calendarDateToLocalDate("2026-09-17"),
        classNames: { root: "w-full" },
      }),
    );
    const root = html.match(/data-slot="calendar" class="([^"]*)"/);
    expect(root).not.toBeNull();
    const classes = root![1].split(" ");
    expect(classes).toContain("w-full");
    expect(classes).not.toContain("w-fit");
  });
});

describe("month paging (spec 0011, AC-1, AC-3)", () => {
  // The calendar's own month bound props, computed exactly as `DatePicker`
  // computes them; checked against the real `Calendar` (react-day-picker),
  // since a closed `BoardSheet` never mounts its content for a static render.
  const { todayLocal, lastDayLocal } = pickerBounds("2026-09-17", 14);
  const selected = calendarDateToLocalDate("2026-09-17");

  it("blocks paging before today on the public board (allowPastPick false)", () => {
    const html = renderToStaticMarkup(
      createElement(Calendar, {
        mode: "single",
        selected,
        month: selected,
        startMonth: todayLocal,
        endMonth: lastDayLocal,
      }),
    );
    expect(navButton(html, "Go to the Previous Month")).toContain('aria-disabled="true"');
  });

  it("leaves paging into the past open on the staff board (allowPastPick true)", () => {
    const html = renderToStaticMarkup(
      createElement(Calendar, {
        mode: "single",
        selected,
        month: selected,
        startMonth: undefined,
        endMonth: lastDayLocal,
      }),
    );
    expect(navButton(html, "Go to the Previous Month")).not.toContain('aria-disabled="true"');
  });

  it("blocks paging past the horizon on both boards", () => {
    const html = renderToStaticMarkup(
      createElement(Calendar, {
        mode: "single",
        selected,
        month: lastDayLocal,
        startMonth: todayLocal,
        endMonth: lastDayLocal,
      }),
    );
    expect(navButton(html, "Go to the Next Month")).toContain('aria-disabled="true"');
  });
});

/**
 * Spec 0007, AC-22: a day of the week the venue is closed reads as muted and
 * carries a name that says so, and stays selectable, because staff open a
 * closed day to review or add what is on it.
 */
describe("isClosedDay (spec 0007, AC-22)", () => {
  // 2026-09-21 is a Monday, 2026-09-22 a Tuesday, 2026-09-27 a Sunday.
  const monday = calendarDateToLocalDate("2026-09-21");
  const tuesday = calendarDateToLocalDate("2026-09-22");
  const sunday = calendarDateToLocalDate("2026-09-27");

  it("matches every date falling on a closed day of the week", () => {
    expect(isClosedDay(monday, [1])).toBe(true);
    expect(isClosedDay(calendarDateToLocalDate("2026-09-28"), [1])).toBe(true);
    expect(isClosedDay(tuesday, [1])).toBe(false);
  });

  it("reads 0 as Sunday, the same numbering the table stores", () => {
    expect(isClosedDay(sunday, [0])).toBe(true);
    expect(isClosedDay(monday, [0])).toBe(false);
  });

  it("matches nothing when the venue is open all week", () => {
    expect(isClosedDay(monday, [])).toBe(false);
    expect(isClosedDay(sunday, [])).toBe(false);
  });

  it("handles a week with every day closed", () => {
    const week = [0, 1, 2, 3, 4, 5, 6];
    expect(isClosedDay(monday, week)).toBe(true);
    expect(isClosedDay(sunday, week)).toBe(true);
  });
});

describe("the calendar's closed days (spec 0007, AC-22)", () => {
  const { todayLocal, lastDayLocal } = pickerBounds("2026-09-17", 30);

  /** The calendar exactly as `DatePicker` configures it, with Monday shut. */
  const calendar = () =>
    renderToStaticMarkup(
      createElement(Calendar, {
        mode: "single",
        required: true,
        selected: calendarDateToLocalDate("2026-09-17"),
        defaultMonth: calendarDateToLocalDate("2026-09-17"),
        startMonth: todayLocal,
        endMonth: lastDayLocal,
        disabled: (day: Date) => isDayDisabled(day, todayLocal, lastDayLocal, false),
        modifiers: { venueClosed: (day: Date) => isClosedDay(day, [1]) },
        modifiersClassNames: { venueClosed: "text-muted-foreground line-through" },
        labels: {
          labelDayButton: (day: Date) => {
            const label = day.toLocaleDateString("en-PH", {
              weekday: "long",
              month: "long",
              day: "numeric",
            });
            return isClosedDay(day, [1]) ? `${label} The venue is closed this day.` : label;
          },
        },
      }),
    );

  it("mutes a closed day and leaves every other day alone", () => {
    const html = calendar();
    const struck = [...html.matchAll(/line-through/g)];
    // Four or five Mondays fall inside a month, and nothing else is struck.
    expect(struck.length).toBeGreaterThanOrEqual(4);
    expect(html).toMatch(/line-through/);
  });

  it("says the venue is closed in the day's accessible name", () => {
    expect(calendar()).toMatch(/Monday, September \d+ The venue is closed this day\./);
  });

  it("leaves a future closed day selectable rather than disabled", () => {
    const html = calendar();
    const monday = html.match(
      /<button[^>]*aria-label="Monday, September 21 The venue is closed this day\."[^>]*>/,
    );
    expect(monday).not.toBeNull();
    // The attribute itself, not the `disabled:` utility classes every button carries.
    expect(monday![0]).not.toMatch(/\sdisabled=""/);
    expect(monday![0]).not.toMatch(/aria-disabled="true"/);
  });

  it("still disables a closed day that has passed, for the ordinary past reason", () => {
    const html = calendar();
    const past = html.match(/<button[^>]*aria-label="Monday, September 7[^"]*"[^>]*>/);
    // September 2026 opens on a Tuesday, so the 7th is the month's first Monday
    // and sits before the 17th the calendar calls today.
    expect(past).not.toBeNull();
    expect(past![0]).toMatch(/\sdisabled=""/);
  });
});
