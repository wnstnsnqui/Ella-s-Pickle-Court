import { describe, expect, it } from "vitest";

import { CELL_STATES } from "@/lib/schedule/constants";

import {
  CELL_VIEW_HINT,
  CELL_VIEW_ICON,
  CELL_VIEW_NAME,
  CELL_VIEWS,
  cellViewFor,
  PUBLIC_LEGEND_VIEWS,
} from "./cell-view";

/**
 * Spec 0003, AC-5 and invariants 3 and 4: every view has a word, an icon and
 * a hint, so colour is never the only signal; the browser's own views layer
 * over the database state in a fixed order of urgency.
 */
describe("cell views", () => {
  it("gives every view a spoken name, an icon and a hint", () => {
    for (const view of CELL_VIEWS) {
      expect(CELL_VIEW_NAME[view]).toBeTruthy();
      expect(CELL_VIEW_ICON[view]).toBeTruthy();
      expect(CELL_VIEW_HINT[view]).toBeTruthy();
    }
  });

  it("uses a different icon for every view, so the board reads in greyscale", () => {
    const icons = new Set(CELL_VIEWS.map((view) => CELL_VIEW_ICON[view]));
    expect(icons.size).toBe(CELL_VIEWS.length);
  });

  it("shows a player only the three states the database holds", () => {
    expect([...PUBLIC_LEGEND_VIEWS].sort()).toEqual([...CELL_STATES].sort());
  });
});

describe("cellViewFor", () => {
  it("reads as the grid's own state when the browser is doing nothing to it", () => {
    for (const state of CELL_STATES) expect(cellViewFor({ state })).toBe(state);
  });

  it("layers out of hours over the state", () => {
    expect(cellViewFor({ state: "available", outOfHours: true })).toBe("out-of-hours");
  });

  it("puts the hour a person picked above out of hours", () => {
    expect(cellViewFor({ state: "available", outOfHours: true, selected: true })).toBe("selected");
  });

  it("puts a change in flight above a selection", () => {
    expect(cellViewFor({ state: "booked", selected: true, saving: true })).toBe("saving");
  });

  it("puts a refused change above everything else", () => {
    expect(
      cellViewFor({
        state: "booked",
        outOfHours: true,
        selected: true,
        saving: true,
        failed: true,
      }),
    ).toBe("failed");
  });
});
