import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScheduleCell } from "./schedule-cell";

/**
 * Spec 0003, AC-5 and AC-11, spec 0005, AC-11, spec 0006, AC-4: a cell says
 * what it is and how it reads in words, carries the roving tab stop only when
 * focused, is disabled for assistive tech when nothing can act on it, and
 * marks a change, a lock and an ended slot as data a stylesheet can read.
 */

const render = (props: Partial<Parameters<typeof ScheduleCell>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(ScheduleCell, { view: "available", label: "Court 1 at 9am", ...props }),
  );

describe("ScheduleCell", () => {
  it("names the cell, then how it reads", () => {
    expect(render()).toContain("Court 1 at 9am. Available</span>");
  });

  it("adds the caption to the spoken name and shows it once visually, hidden from readers", () => {
    const html = render({ view: "booked", caption: "Lea" });
    expect(html).toContain("Court 1 at 9am. Booked, Lea</span>");
    expect(html).toMatch(/<span aria-hidden="true"[^>]*><span[^>]*>Lea<\/span><\/span>/);
  });

  it("marks an online booking with a globe, a word while unchecked, and says so (spec 0016, AC-4)", () => {
    const unchecked = render({ view: "booked", caption: { text: "Lea", online: "unchecked" } });
    expect(unchecked).toContain("Check payment · Lea");
    expect(unchecked).toContain("Booked, Lea, online booking, payment not yet checked</span>");
    expect(unchecked).toContain("<svg");

    const held = render({ view: "booked", caption: { text: "Lea", online: "held" } });
    expect(held).toContain("Held · Lea");

    const checked = render({ view: "booked", caption: { text: "Lea", online: "checked" } });
    expect(checked).toContain(">Lea</span>");
    expect(checked).toContain("Booked, Lea, online booking</span>");
    expect(checked).toContain('data-view="booked"');
  });

  it("says a locked or ended slot has ended", () => {
    expect(render({ view: "booked", locked: true })).toContain("Booked, ended");
    expect(render({ past: true })).toContain("Available, ended");
  });

  it("is a gridcell that is disabled to assistive tech when nothing can act on it", () => {
    const html = render();
    expect(html).toContain('role="gridcell"');
    expect(html).toContain('aria-disabled="true"');
  });

  it("is enabled when a board can act on it", () => {
    expect(render({ onSelect: () => {} })).not.toContain("aria-disabled");
  });

  it("carries the tab stop only when it is the focused cell", () => {
    expect(render({ focused: true })).toContain('tabindex="0"');
    expect(render()).toContain('tabindex="-1"');
  });

  it("marks its view, a change, a lock and an ended slot as data", () => {
    const html = render({ view: "failed", changed: true, locked: true, past: true });
    expect(html).toContain('data-view="failed"');
    expect(html).toContain('data-changed="true"');
    expect(html).toContain('data-locked="true"');
    expect(html).toContain('data-past="true"');
    const quiet = render();
    expect(quiet).not.toContain("data-changed");
    expect(quiet).not.toContain("data-locked");
    expect(quiet).not.toContain("data-past");
  });

  it("draws its focus ring solid, since outline-none leaves outline-2 with no style (spec 0018, AC-6)", () => {
    const html = render();
    expect(html).toContain("outline-none");
    expect(html).toContain("focus-visible:outline-2");
    expect(html).toContain("focus-visible:outline-solid");
  });
});
