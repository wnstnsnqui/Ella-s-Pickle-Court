import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BoardDayHeader } from "./board-day-header";

/**
 * Spec 0018, AC-5 and AC-8: the top of a board card. The heading names the
 * day, with "Today, " in muted text when it is venue today and "· past" after
 * a past day. Venue today comes from the server's `now` in the venue's zone,
 * never the device clock, and while a day is being read the heading already
 * names the target day.
 *
 * `NOW` is 2026-10-04T17:00Z, which is 1am on Mon 5 Oct in Manila while it is
 * still Sun 4 Oct in UTC: a board that read the wrong clock would say so.
 */

const NOW = "2026-10-04T17:00:00.000Z";

const render = (props: Partial<Parameters<typeof BoardDayHeader>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(BoardDayHeader, {
      date: "2026-10-05",
      onNavigate: () => {},
      timezone: "Asia/Manila",
      horizonDays: 30,
      now: NOW,
      closedDays: [],
      ...props,
    }),
  );

const heading = (html: string) =>
  (/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(html)?.[1] ?? "").replace(/<[^>]+>/g, "");

describe("BoardDayHeader", () => {
  it("says Today, in muted text, on venue today from the server's clock (AC-5)", () => {
    const html = render();
    expect(heading(html)).toBe("Today, Mon 5 Oct");
    expect(html).toContain('<span class="text-muted-foreground">Today, </span>');
  });

  it("names a later day plainly", () => {
    expect(heading(render({ date: "2026-10-07" }))).toBe("Wed 7 Oct");
  });

  it("marks a past day with · past (AC-5, AC-8)", () => {
    expect(heading(render({ date: "2026-10-03" }))).toBe("Sat 3 Oct · past");
  });

  it("names the pending day at once, before it lands (AC-8, spec 0014 AC-2)", () => {
    expect(heading(render({ date: "2026-10-05", pendingDate: "2026-10-09" }))).toBe("Fri 9 Oct");
  });

  it("puts the board's aside beside the heading (the online checks chip on staff)", () => {
    const html = render({ aside: createElement("button", { type: "button" }, "All checked") });
    expect(html).toMatch(/<\/h2><button type="button">All checked<\/button><\/div>/);
  });

  it("carries the strip, highlighting venue today, and the calendar button", () => {
    const html = render();
    expect(html).toContain('aria-label="Today, Mon 5 Oct"');
    expect(html).toContain('aria-label="Pick a date"');
  });

  it("highlights the pending day in the strip, not the landed one", () => {
    const html = render({ date: "2026-10-05", pendingDate: "2026-10-09" });
    const checked = [...html.matchAll(/<input[^>]*checked=""[^>]*>/g)].map(
      (m) => /aria-label="([^"]*)"/.exec(m[0])?.[1],
    );
    expect(new Set(checked)).toEqual(new Set(["Fri 9 Oct"]));
  });
});
