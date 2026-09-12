import {
  Ban,
  CalendarCheck,
  CircleCheck,
  CircleDot,
  LoaderCircle,
  Moon,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { CellState } from "@/lib/schedule/constants";

/**
 * What a cell reads as, to a person. Spec 0003, AC-5.
 *
 * This is the UI layer's vocabulary, deliberately wider than the database's.
 * `CELL_STATES` in `lib/schedule/constants.ts` stays exactly three values
 * (invariant 3): `out-of-hours` is a row flag layered over a real state, and
 * `selected`, `saving` and `failed` are browser state that never reaches
 * Postgres. Keeping them apart is what stops a passing mood in the interface
 * from turning into a column somebody has to migrate later.
 */
export const CELL_VIEWS = [
  "available",
  "booked",
  "unavailable",
  "out-of-hours",
  "selected",
  "saving",
  "failed",
] as const;

export type CellView = (typeof CELL_VIEWS)[number];

/**
 * The name a screen reader announces. Invariant 4: colour is never the only
 * signal, so every view carries a word as well as an icon.
 */
export const CELL_VIEW_NAME: Record<CellView, string> = {
  available: "Available",
  booked: "Booked",
  unavailable: "Unavailable",
  "out-of-hours": "Outside opening hours",
  selected: "Selected",
  saving: "Saving",
  failed: "Change refused",
};

/** One distinct shape per view, so the board still works in glare or greyscale. */
export const CELL_VIEW_ICON: Record<CellView, LucideIcon> = {
  available: CircleCheck,
  booked: CalendarCheck,
  unavailable: Ban,
  "out-of-hours": Moon,
  selected: CircleDot,
  saving: LoaderCircle,
  failed: TriangleAlert,
};

/** A short line explaining each view, used by the legend and the design page. */
export const CELL_VIEW_HINT: Record<CellView, string> = {
  available: "Free to book",
  booked: "Somebody has this hour",
  unavailable: "Court closed for this hour",
  "out-of-hours": "The venue is not open",
  selected: "The hour you are about to change",
  saving: "Your change is on its way",
  failed: "Somebody got there first, refetch",
};

/** The three views a legend shows a player. The rest are staff or browser only. */
export const PUBLIC_LEGEND_VIEWS: readonly CellView[] = ["available", "booked", "unavailable"];

/**
 * Which view a cell reads as, given what the grid derived and what the browser
 * is doing to it right now.
 *
 * Precedence runs from the most urgent outward: a refused change, then a change
 * in flight, then the hour the person picked, then the venue being shut, and only
 * then the state that came out of `buildGrid`. Each layer is genuinely more
 * important to the reader than the one under it.
 */
export function cellViewFor(input: {
  state: CellState;
  outOfHours?: boolean;
  selected?: boolean;
  saving?: boolean;
  failed?: boolean;
}): CellView {
  if (input.failed) return "failed";
  if (input.saving) return "saving";
  if (input.selected) return "selected";
  if (input.outOfHours) return "out-of-hours";
  return input.state;
}
