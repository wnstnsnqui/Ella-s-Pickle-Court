import { openRows, rowEnded } from "@/lib/schedule/availability";
import type { Grid, GridCell, GridCourt, GridRow } from "@/lib/schedule/grid";
import { formatSlotLabel } from "@/lib/time";
import { PRICE_PER_HOUR } from "@/lib/venue";

/**
 * The booking section's rules, pure so the tests can hold them. Spec 0013,
 * AC-4, AC-12 and AC-13.
 */

/** The five things a tile can read as on the landing page (AC-4). */
export type TileView = "free" | "booked" | "closed" | "past" | "selected";

/**
 * Past is a property of time, so an ended hour reads Past on every court,
 * whatever was on it. Otherwise the grid's own state decides, and a Free tile
 * the player picked reads Selected.
 */
export function tileView(
  cell: Pick<GridCell, "state">,
  row: Pick<GridRow, "endsAt">,
  nowMs: number,
  selected: boolean,
): TileView {
  if (rowEnded(row, nowMs)) return "past";
  if (cell.state === "booked") return "booked";
  if (cell.state === "unavailable") return "closed";
  return selected ? "selected" : "free";
}

/** Whether a tile in this view can be pressed. */
export function isPressable(view: TileView): boolean {
  return view === "free" || view === "selected";
}

/** One pick: a court and the row it starts on. */
export function pickKey(courtId: number, startsAt: string): string {
  return `${courtId}|${startsAt}`;
}

export type PickGroup = { court: GridCourt; labels: string[] };

/**
 * The picks grouped by court in sort order, hours in time order, labelled as
 * the grid labels them: `[{ court: Court 1, labels: ["5pm", "6pm"] }]`.
 */
export function groupPicks(grid: Pick<Grid, "courts" | "rows">, picks: ReadonlySet<string>) {
  const courts = [...grid.courts].sort((a, b) => a.sortOrder - b.sortOrder);
  const rows = openRows(grid);
  const groups: PickGroup[] = [];
  for (const court of courts) {
    const labels = rows
      .filter((row) => picks.has(pickKey(court.id, row.startsAt)))
      .map((row) => formatSlotLabel(row.label));
    if (labels.length > 0) groups.push({ court, labels });
  }
  return groups;
}

/** Pesos for the picks: tiles times hours per tile times the hourly price (AC-12). */
export function bookingTotal(tiles: number, slotMinutes: number): number {
  return tiles * (slotMinutes / 60) * PRICE_PER_HOUR;
}

/** "5pm", "5pm and 6pm", "5pm, 6pm and 7pm". */
export function joinWithAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * The text message the Text us button writes (AC-13): "Hi! Can I book Court 1
 * at 5pm and 6pm, Court 2 at 7pm on Sat 27 Sep?"
 */
export function smsBody(dayHeading: string, groups: readonly PickGroup[]): string {
  const courts = groups.map((group) => `${group.court.name} at ${joinWithAnd(group.labels)}`);
  return `Hi! Can I book ${courts.join(", ")} on ${dayHeading}?`;
}
