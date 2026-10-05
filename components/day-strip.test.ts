import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DayStrip, dayOptionName } from "./day-strip";

/**
 * Spec 0018, AC-8: one shared strip of days for both boards. Every day is a
 * native radio named "Today, Mon 5 Oct" or "Tue 6 Oct", with ". Closed" on a
 * closed weekday whose short name is struck through. It runs from venue today
 * through the booking horizon: every day in the phone row, a week at a time on
 * wide screens. The chosen day is the pending one while a read is on its way,
 * else the day on screen, and a day outside the strip highlights nothing.
 *
 * 2026-10-05 is a Monday, so 2026-10-07 is a Wednesday (`dayOfWeek` 3).
 */

const TODAY = "2026-10-05";

const render = (props: Partial<Parameters<typeof DayStrip>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(DayStrip, {
      date: TODAY,
      today: TODAY,
      horizonDays: 30,
      closedDays: [],
      onPick: () => {},
      ...props,
    }),
  );

/** Every radio in one of the two strips, as `[aria-label, checked]`. */
function radios(html: string, name: "board-day" | "board-day-scroll") {
  return [...html.matchAll(/<input[^>]*>/g)]
    .map((match) => match[0])
    .filter((input) => input.includes(`name="${name}"`))
    .map((input) => ({
      label: /aria-label="([^"]*)"/.exec(input)?.[1],
      checked: / checked=""/.test(input),
    }));
}

describe("dayOptionName", () => {
  it("names venue today with a Today prefix (AC-8)", () => {
    expect(dayOptionName(TODAY, TODAY, [])).toBe("Today, Mon 5 Oct");
  });

  it("names any other day by its heading alone", () => {
    expect(dayOptionName("2026-10-06", TODAY, [])).toBe("Tue 6 Oct");
  });

  it("adds Closed on a weekday the venue does not open", () => {
    expect(dayOptionName("2026-10-07", TODAY, [3])).toBe("Wed 7 Oct. Closed");
  });

  it("keeps both the Today prefix and Closed when today is a closed day", () => {
    expect(dayOptionName(TODAY, TODAY, [1])).toBe("Today, Mon 5 Oct. Closed");
  });
});

describe("DayStrip", () => {
  it("puts every day from today through the horizon in the phone row (AC-8)", () => {
    const phone = radios(render({ horizonDays: 30 }), "board-day-scroll");
    expect(phone).toHaveLength(31);
    expect(phone[0].label).toBe("Today, Mon 5 Oct");
    expect(phone.at(-1)?.label).toBe("Wed 4 Nov");
  });

  it("shows seven days at a time on wide screens", () => {
    const wide = radios(render({ horizonDays: 30 }), "board-day");
    expect(wide.map((day) => day.label)).toEqual([
      "Today, Mon 5 Oct",
      "Tue 6 Oct",
      "Wed 7 Oct",
      "Thu 8 Oct",
      "Fri 9 Oct",
      "Sat 10 Oct",
      "Sun 11 Oct",
    ]);
  });

  it("shows only the days there are when the horizon is shorter than a week", () => {
    const html = render({ horizonDays: 2 });
    expect(radios(html, "board-day")).toHaveLength(3);
    expect(radios(html, "board-day-scroll")).toHaveLength(3);
  });

  it("checks the day on screen in both strips", () => {
    const html = render({ date: "2026-10-06" });
    for (const name of ["board-day", "board-day-scroll"] as const) {
      expect(radios(html, name).filter((day) => day.checked)).toEqual([
        { label: "Tue 6 Oct", checked: true },
      ]);
    }
  });

  it("moves the highlight to the pending day at once, before it lands (AC-8, spec 0014 AC-2)", () => {
    const wide = radios(render({ date: TODAY, pendingDate: "2026-10-08" }), "board-day");
    expect(wide.filter((day) => day.checked).map((day) => day.label)).toEqual(["Thu 8 Oct"]);
  });

  it("opens the wide strip on the week holding the chosen day", () => {
    const wide = radios(render({ date: "2026-10-14" }), "board-day");
    expect(wide[0].label).toBe("Mon 12 Oct");
    expect(wide.find((day) => day.checked)?.label).toBe("Wed 14 Oct");
  });

  it("highlights no day when the day on screen is in the past (AC-8)", () => {
    const html = render({ date: "2026-10-03" });
    expect(radios(html, "board-day").some((day) => day.checked)).toBe(false);
    expect(radios(html, "board-day-scroll").some((day) => day.checked)).toBe(false);
  });

  it("strikes through the short weekday of a closed day and names it Closed", () => {
    const html = render({ closedDays: [3] });
    expect(radios(html, "board-day").map((day) => day.label)).toContain("Wed 7 Oct. Closed");
    expect(html).toMatch(/<span class="[^"]*line-through[^"]*">Wed<\/span>/);
    expect(html).not.toMatch(/line-through[^"]*">Tue</);
  });

  it("disables the previous week arrow on the first week and the next on the last", () => {
    const arrow = (html: string, name: string) =>
      new RegExp(`<button[^>]*aria-label="${name}"[^>]*>`).exec(html)?.[0] ?? "";

    const first = render({ date: TODAY });
    expect(arrow(first, "Previous week")).toContain(' disabled=""');
    expect(arrow(first, "Next week")).not.toContain(' disabled=""');

    const last = render({ date: "2026-11-04" });
    expect(arrow(last, "Next week")).toContain(' disabled=""');
    expect(arrow(last, "Previous week")).not.toContain(' disabled=""');
  });

  it("groups the days under a named fieldset, so a screen reader hears the question", () => {
    expect(render()).toMatch(/<fieldset[^>]*><legend class="sr-only">Pick a day<\/legend>/);
  });

  it("puts the calendar at the end of the strip's row", () => {
    const html = render({ calendar: createElement("button", { type: "button" }, "Calendar") });
    expect(html).toMatch(/<\/fieldset><button type="button">Calendar<\/button><\/div>$/);
  });
});
