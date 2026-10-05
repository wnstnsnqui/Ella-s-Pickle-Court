import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SelectionRun } from "@/lib/schedule/selection";

import { runsByCourt, SummaryCard } from "./summary-card";

/**
 * Spec 0018, AC-10 (and spec 0005, AC-3): the staff selection as the landing's
 * summary card. From 1024px it is an aside that stays in place with a muted
 * line when nothing is picked, so the grid never changes width. Below that it
 * floats over the grid only while something is picked. Both list the picks as
 * runs grouped by court and say how many bookings that makes.
 */

const run = (courtId: number, courtName: string, startTime: string, endTime: string) =>
  ({
    courtId,
    courtName,
    date: "2026-10-06",
    startTime,
    endTime,
    startsAt: "",
    endsAt: "",
    keys: [],
    minutes: (Number(endTime.slice(0, 2)) - Number(startTime.slice(0, 2))) * 60,
  }) as SelectionRun;

const PICKS = [
  run(1, "Court 1", "05:00", "07:00"),
  run(1, "Court 1", "09:00", "10:00"),
  run(2, "Court 2", "06:00", "07:00"),
];

const render = (props: Partial<Parameters<typeof SummaryCard>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(SummaryCard, {
      layout: "aside",
      runs: [],
      day: "Tue 6 Oct",
      onBook: () => {},
      onClose: () => {},
      onClear: () => {},
      ...props,
    }),
  );

describe("runsByCourt", () => {
  it("groups the runs by court, one line each, in the order picked (AC-10)", () => {
    expect(runsByCourt(PICKS)).toEqual(["Court 1: 5am to 7am, 9am to 10am", "Court 2: 6am to 7am"]);
  });

  it("returns no lines for no picks", () => {
    expect(runsByCourt([])).toEqual([]);
  });

  it("reads an end at the stroke of midnight as Midnight", () => {
    expect(runsByCourt([run(1, "Court 1", "23:00", "24:00")])).toEqual([
      "Court 1: 11pm to Midnight",
    ]);
  });
});

describe("SummaryCard, beside the grid", () => {
  it("stays in place with a muted line and no actions when nothing is picked (AC-10)", () => {
    const html = render();
    expect(html).toMatch(/^<aside aria-label="Your selection"/);
    expect(html).toContain("Your selection</h2>");
    expect(html).toContain("Pick free hours to book or close them");
    expect(html).not.toContain("<button");
  });

  it("lists the day, the runs by court and the booking count when hours are picked", () => {
    const html = render({ runs: PICKS });
    expect(html).toContain("Tue 6 Oct");
    expect(html).toContain("Court 1: 5am to 7am, 9am to 10am");
    expect(html).toContain("Court 2: 6am to 7am");
    expect(html).toContain("3 bookings, 4 hours on 2 courts");
    expect(html).not.toContain("Pick free hours");
  });

  it("says one booking, not one bookings", () => {
    expect(render({ runs: [run(1, "Court 1", "05:00", "06:00")] })).toContain(
      "1 booking, 1 hour on 1 court",
    );
  });

  it("offers Book, Close hours and Clear, in that order, with Book in ink (AC-4, AC-10)", () => {
    const html = render({ runs: PICKS });
    const buttons = [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]);
    expect(buttons.map((b) => b.replace(/<[^>]+>/g, ""))).toEqual(["Book", "Close hours", "Clear"]);
    expect(buttons[0]).toContain("bg-mark");
    expect(buttons.every((b) => b.includes("press"))).toBe(true);
  });
});

describe("SummaryCard, floating on a phone", () => {
  it("renders nothing while nothing is picked (AC-10)", () => {
    expect(render({ layout: "floating" })).toBe("");
  });

  it("is a labelled region with the picks and an icon button that names Clear", () => {
    const html = render({ layout: "floating", runs: PICKS });
    expect(html).toMatch(/^<div role="region" aria-label="Your selection" data-summary-float=""/);
    expect(html).toContain('data-state="open"');
    expect(html).toContain("Court 1: 5am to 7am, 9am to 10am");
    expect(html).toContain('aria-label="Clear selection"');
  });

  it("offers Book in ink and Close hours, both enabled while picked", () => {
    const html = render({ layout: "floating", runs: PICKS });
    const book = /<button[^>]*>Book<svg/.exec(html)?.[0] ?? "";
    expect(book).toContain("bg-mark");
    expect(book).not.toContain(' disabled=""');
    const close = /<button[^>]*>(?:(?!<button)[\s\S])*?Close hours<\/button>/.exec(html)?.[0] ?? "";
    expect(close).not.toContain(' disabled=""');
  });
});
