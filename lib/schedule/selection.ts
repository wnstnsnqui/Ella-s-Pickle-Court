import { cellKey, parseCellKey } from "@/components/schedule/cell-key";
import { localEndTimeInZone } from "@/lib/time";

import type { Grid, GridRow } from "./grid";
import type { ReservationRun } from "./schemas";

/**
 * The selection on the staff board. Spec 0005, AC-3 and AC-6.
 *
 * Browser state only, and pure: a set of cell keys, the grid it was made
 * against, and nothing else. Every function here returns a new value and never
 * touches the arguments, so the board can hand the results straight to React.
 * Turning a selection into runs happens here too, because that is what the
 * batch action receives and it is the one derivation worth a unit test.
 */

export type Selection = ReadonlySet<string>;

/** A contiguous stretch of selected slots on one court, as the bar lists it. */
export type SelectionRun = ReservationRun & {
  courtName: string;
  /** UTC instants, the first row's start and the last row's end. */
  startsAt: string;
  endsAt: string;
  /** The keys that make up the run, in row order. */
  keys: string[];
  /** Whole minutes, so an hour count can be derived without touching a clock. */
  minutes: number;
};

export const EMPTY_SELECTION: Selection = new Set();

/** Add a key, or take it away again if it was already in. */
export function toggleSelection(selection: Selection, key: string): Selection {
  const next = new Set(selection);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** Whether a cell may join the selection at all: Available, in hours, and not locked. */
export function isSelectable(grid: Grid, key: string, locked: ReadonlySet<string>): boolean {
  if (locked.has(key)) return false;
  const found = findCell(grid, key);
  if (!found) return false;
  return found.cell.state === "available" && !found.row.outOfHours;
}

/**
 * Keep only the keys that still read Available in this grid. Every refetch
 * runs the selection through here, and whatever falls out is what the AC-6
 * toast tells the person about.
 */
export function pruneSelection(
  selection: Selection,
  grid: Grid,
  locked: ReadonlySet<string>,
): { kept: Selection; removed: string[] } {
  const kept = new Set<string>();
  const removed: string[] = [];
  for (const key of selection) {
    if (isSelectable(grid, key, locked)) kept.add(key);
    else removed.push(key);
  }
  return { kept, removed };
}

/**
 * Group the selection by court, sort by row, and split wherever the next row
 * does not start where the previous one ended. A gap is a new run, on purpose:
 * two hours with one free between them are two bookings.
 */
export function selectionRuns(selection: Selection, grid: Grid): SelectionRun[] {
  const rowByStart = new Map<string, GridRow>();
  for (const row of grid.rows) rowByStart.set(row.startsAt, row);

  const byCourt = new Map<number, GridRow[]>();
  for (const key of selection) {
    const { courtId, rowStartsAt } = parseCellKey(key);
    const row = rowByStart.get(rowStartsAt);
    if (!row) continue;
    const rows = byCourt.get(courtId) ?? [];
    rows.push(row);
    byCourt.set(courtId, rows);
  }

  const runs: SelectionRun[] = [];
  const courtOrder = new Map(grid.courts.map((court, index) => [court.id, index]));

  for (const [courtId, rows] of byCourt) {
    const court = grid.courts.find((candidate) => candidate.id === courtId);
    if (!court) continue;
    rows.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

    let run: GridRow[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const first = run[0];
      const last = run[run.length - 1];
      runs.push({
        courtId,
        courtName: court.name,
        date: grid.date,
        startTime: first.label,
        endTime: localEndTimeInZone(last.endsAt, grid.timezone),
        startsAt: first.startsAt,
        endsAt: last.endsAt,
        keys: run.map((row) => cellKey(courtId, row.startsAt)),
        minutes: Math.round((Date.parse(last.endsAt) - Date.parse(first.startsAt)) / 60_000),
      });
      run = [];
    };

    for (const row of rows) {
      const previous = run[run.length - 1];
      if (previous && previous.endsAt !== row.startsAt) flush();
      run.push(row);
    }
    flush();
  }

  return runs.sort(
    (a, b) =>
      (courtOrder.get(a.courtId) ?? 0) - (courtOrder.get(b.courtId) ?? 0) ||
      Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );
}

/**
 * The cells one court's booking covers, from a range typed in rather than
 * picked. Spec 0007, AC-19: on a closed day no cell can be tapped, so Add
 * booking names the court, the start and the end, and this turns that back
 * into the keys the ordinary write path already takes.
 *
 * Rows outside opening hours count here, which is the whole point: every row
 * on a closed day is one.
 */
export function keysInRange(
  grid: Grid,
  courtId: number,
  startsAt: string,
  endsAt: string,
): Selection {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  return new Set(
    grid.rows
      .filter((row) => Date.parse(row.startsAt) >= start && Date.parse(row.endsAt) <= end)
      .map((row) => cellKey(courtId, row.startsAt)),
  );
}

/** "3 hours on 2 courts": the numbers the bar and the success toast both show. */
export function summarizeRuns(runs: readonly SelectionRun[]): { hours: number; courts: number } {
  const minutes = runs.reduce((total, run) => total + run.minutes, 0);
  return { hours: minutes / 60, courts: new Set(runs.map((run) => run.courtId)).size };
}

/** The bar's own words for a summary, singular and plural handled. */
export function describeSummary(summary: { hours: number; courts: number }): string {
  const hours = Number.isInteger(summary.hours) ? String(summary.hours) : summary.hours.toFixed(1);
  const hourWord = summary.hours === 1 ? "hour" : "hours";
  const courtWord = summary.courts === 1 ? "court" : "courts";
  return `${hours} ${hourWord} on ${summary.courts} ${courtWord}`;
}

/** The runs the action receives: the four fields and nothing derived. */
export function toReservationRuns(runs: readonly SelectionRun[]): ReservationRun[] {
  return runs.map(({ courtId, date, startTime, endTime }) => ({
    courtId,
    date,
    startTime,
    endTime,
  }));
}

function findCell(grid: Grid, key: string) {
  const { courtId, rowStartsAt } = parseCellKey(key);
  const row = grid.rows.find((candidate) => candidate.startsAt === rowStartsAt);
  if (!row) return null;
  const cell = row.cells.find((candidate) => candidate.courtId === courtId);
  if (!cell) return null;
  return { row, cell };
}
