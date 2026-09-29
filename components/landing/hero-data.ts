import { nextFreeCell, openRows, upcomingRows } from "@/lib/schedule/availability";
import type { Grid, GridCourt } from "@/lib/schedule/grid";
import { formatSlotLabel, localTimeInZone } from "@/lib/time";

/**
 * The hero's small board, worked out from a real grid. Spec 0013, AC-15.
 *
 * Pure: the page decides which grid to hand in (today's, or tomorrow's when
 * today has nothing left), and this turns it into the few rows the hero shows,
 * the caption and the chip.
 */

export type HeroTile = "free" | "booked" | "closed";

export type HeroBoardData = {
  day: "today" | "tomorrow";
  caption: string;
  courts: GridCourt[];
  columns: { label: string; tiles: { courtId: number; tile: HeroTile }[] }[];
  chip: string;
};

const TILE_FOR = { available: "free", booked: "booked", unavailable: "closed" } as const;

export const HERO_ROWS = 5;

/**
 * Today's next rows, or null when today has none left (closed all day, or
 * after closing), which is the page's cue to try tomorrow.
 */
export function heroBoardForToday(grid: Grid, nowIso: string): HeroBoardData | null {
  const nowMs = Date.parse(nowIso);
  const rows = upcomingRows(grid, nowMs, HERO_ROWS);
  if (rows.length === 0) return null;
  const free = nextFreeCell(grid, nowMs);
  const asOf = formatSlotLabel(localTimeInZone(nowIso, grid.timezone));
  return build(grid, rows, "today", `As of ${asOf}`, free ? freeChip(free) : "Fully booked today");
}

/** Tomorrow's first rows, or null when tomorrow is closed. */
export function heroBoardForTomorrow(grid: Grid): HeroBoardData | null {
  if (grid.closed) return null;
  const rows = openRows(grid).slice(0, HERO_ROWS);
  if (rows.length === 0) return null;
  // Every cell of tomorrow is after now, so the earliest free one is the chip.
  const free = nextFreeCell(grid, Number.NEGATIVE_INFINITY);
  return build(
    grid,
    rows,
    "tomorrow",
    "Closed now · Tomorrow",
    free ? `${freeChip(free)} tomorrow` : "Fully booked tomorrow",
  );
}

function freeChip(free: { court: GridCourt; row: { label: string } }): string {
  return `${free.court.name} is free at ${formatSlotLabel(free.row.label)}`;
}

function build(
  grid: Grid,
  rows: Grid["rows"],
  day: HeroBoardData["day"],
  caption: string,
  chip: string,
): HeroBoardData {
  return {
    day,
    caption,
    chip,
    courts: grid.courts,
    columns: rows.map((row) => ({
      label: formatSlotLabel(row.label),
      tiles: grid.courts.map((court) => {
        const cell = row.cells.find((entry) => entry.courtId === court.id);
        return { courtId: court.id, tile: TILE_FOR[cell?.state ?? "unavailable"] };
      }),
    })),
  };
}
