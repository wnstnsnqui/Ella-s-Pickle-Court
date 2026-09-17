import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Calendar } from "@/components/ui/calendar";
import { calendarDateToLocalDate } from "@/lib/time";

import { DatePicker, disabledReason, isDayDisabled, pickerBounds } from "./date-picker";

/** The nav button's own markup, order of attributes aside. */
function navButton(html: string, label: string): string {
  const match = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`));
  if (!match) throw new Error(`No nav button labelled "${label}" in: ${html}`);
  return match[0];
}

/**
 * The client side mirror of `resolveDate` (spec 0011): the calendar's bound
 * math, its two disabled reasons, and the month paging it produces. Rendered
 * with `next/navigation`'s `useRouter` stubbed, the same way `app/design/page.test.ts`
 * statically renders `DayNav` without a mounted app router.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

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
    href: (to: string) => `/?date=${to}`,
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
