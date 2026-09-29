import type { Grid, GridCourt, GridRow } from "./grid";

/**
 * What a player wants to know from a day's grid at a glance. Spec 0013, AC-3,
 * AC-15.
 *
 * Pure, and in a plain module (no `server-only`), so the server rendered hero
 * and the booking section in the browser read the grid the same way.
 */

/** The rows a player can book in: open hours only, never a staff only out of hours row. */
export function openRows(grid: Pick<Grid, "rows">): GridRow[] {
  return grid.rows.filter((row) => !row.outOfHours);
}

/** Whether a row's slot is over at `nowMs`. */
export function rowEnded(row: Pick<GridRow, "endsAt">, nowMs: number): boolean {
  return Date.parse(row.endsAt) <= nowMs;
}

/** The next up to `limit` open rows whose slot has not ended, for the hero board. */
export function upcomingRows(grid: Pick<Grid, "rows">, nowMs: number, limit = 5): GridRow[] {
  return openRows(grid)
    .filter((row) => !rowEnded(row, nowMs))
    .slice(0, limit);
}

export type FreeCell = { court: GridCourt; row: GridRow };

/**
 * The Free cell with the earliest start after `nowMs` across every court, the
 * court first in sort order winning a tie. A slot already under way counts as
 * after now only if it starts after now, so the chip never names an hour that
 * has begun.
 */
export function nextFreeCell(grid: Pick<Grid, "rows" | "courts">, nowMs: number): FreeCell | null {
  const courts = [...grid.courts].sort((a, b) => a.sortOrder - b.sortOrder);
  let best: FreeCell | null = null;

  for (const row of openRows(grid)) {
    const start = Date.parse(row.startsAt);
    if (start <= nowMs) continue;
    if (best && start >= Date.parse(best.row.startsAt)) continue;
    for (const court of courts) {
      const cell = row.cells.find((entry) => entry.courtId === court.id);
      if (cell?.state === "available") {
        best = { court, row };
        break;
      }
    }
  }

  return best;
}
