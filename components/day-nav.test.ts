import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DayNav } from "./day-nav";

/**
 * Spec 0003 and spec 0014, AC-2 and AC-3: `DayNav` is driven by the board.
 * Given the day on screen and the day a change is on its way to, the heading
 * shows the pending day at once, only the control that asked spins, and the
 * others are disabled. The horizon and the past come from the server stamp,
 * never the device clock.
 */

const TODAY = "2026-09-29";
// Midday at the venue on TODAY, as the server would stamp a schedule.
const NOW = "2026-09-29T04:00:00.000Z";

const render = (props: { date: string; pendingDate?: string; horizonDays?: number }) =>
  renderToStaticMarkup(
    createElement(DayNav, {
      timezone: "Asia/Manila",
      horizonDays: 14,
      now: NOW,
      onNavigate: () => {},
      ...props,
    }),
  );

/** The opening tag of the first button with this accessible name. */
function button(html: string, label: string | RegExp): string {
  const pattern =
    typeof label === "string"
      ? new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`)
      : new RegExp(`<button[^>]*aria-label="${label.source}[^"]*"[^>]*>`);
  const match = html.match(pattern);
  if (!match) throw new Error(`no button labelled ${label}`);
  return match[0];
}

describe("DayNav at rest", () => {
  it("names today as today, from the server stamp", () => {
    const html = render({ date: TODAY });
    expect(html).toContain("Today, Sep 29");
  });

  it("names another day by its weekday and marks a past day as past", () => {
    expect(render({ date: "2026-10-02" })).toContain("Fri, Oct 2");
    const past = render({ date: "2026-09-27" });
    expect(past).toContain("Sun, Sep 27");
    expect(past).toContain(" · past");
  });

  it("spins nothing and disables nothing while no change is pending", () => {
    const html = render({ date: TODAY });
    for (const label of ["Previous day", "Next day", "Pick a date"]) {
      const tag = button(html, label);
      expect(tag).toContain('aria-busy="false"');
      expect(tag).not.toContain('aria-disabled="true"');
    }
  });

  it("disables Next on the last bookable day and says why", () => {
    const html = render({ date: "2026-10-13", horizonDays: 14 });
    const next = button(html, /Next day\./);
    expect(next).toContain("disabled");
    expect(next).toContain("The venue takes bookings 14 days ahead, and this is the last one.");
  });
});

describe("DayNav while a change is pending (spec 0014, AC-2)", () => {
  it("shows the pending day in the heading at once", () => {
    const html = render({ date: TODAY, pendingDate: "2026-09-30" });
    expect(html).toContain("Wed, Sep 30");
    expect(html).not.toContain("Today, Sep 29");
  });

  it("spins only Next when the pending day is the day after, and disables the rest", () => {
    const html = render({ date: TODAY, pendingDate: "2026-09-30" });
    expect(button(html, "Next day")).toContain('aria-busy="true"');
    expect(button(html, "Next day")).not.toContain('aria-disabled="true"');
    expect(button(html, "Previous day")).toContain('aria-disabled="true"');
    expect(button(html, "Pick a date")).toContain('aria-disabled="true"');
  });

  it("spins only Previous when the pending day is the day before", () => {
    const html = render({ date: "2026-09-30", pendingDate: TODAY });
    expect(button(html, "Previous day")).toContain('aria-busy="true"');
    expect(button(html, "Next day")).toContain('aria-disabled="true"');
    expect(html).toContain("Today, Sep 29");
  });

  it("spins the calendar for a day more than one step away (AC-3)", () => {
    const html = render({ date: TODAY, pendingDate: "2026-10-05" });
    expect(button(html, "Pick a date")).toContain('aria-busy="true"');
    expect(button(html, "Next day")).toContain('aria-busy="false"');
    expect(button(html, "Next day")).toContain('aria-disabled="true"');
    expect(button(html, "Previous day")).toContain('aria-disabled="true"');
  });

  it("measures the horizon from the pending day, so Next stops at the last bookable day", () => {
    const html = render({ date: "2026-10-12", pendingDate: "2026-10-13", horizonDays: 14 });
    expect(button(html, /Next day\./)).toContain("disabled");
  });
});
