import { openRows, rowEnded } from "@/lib/schedule/availability";
import type { Grid, GridCell, GridCourt, GridRow } from "@/lib/schedule/grid";
import { formatBookingCode } from "@/lib/booking/code";
import type { BookingRun, SlotRef } from "@/lib/booking/types";
import { VENUE_TIMEZONE } from "@/lib/env";
import { formatSlotLabel, localEndTimeInZone, localTimeInZone } from "@/lib/time";

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

/**
 * Pesos for the picks: tiles times hours per tile times `hourly_rate` from the
 * schedule read (spec 0013, AC-12; spec 0015, AC-17). Only a preview: the
 * hold works the amount out again in Postgres and never takes this one.
 */
export function bookingTotal(tiles: number, slotMinutes: number, hourlyRate: number): number {
  return tiles * (slotMinutes / 60) * hourlyRate;
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

/**
 * The toast line for hours somebody else took while the sheet was open
 * (spec 0015, AC-6): "Court 2 at 6pm was just booked." Slots are matched to
 * the grid's rows by instant, because the database writes its own offset.
 */
export function takenMessage(
  grid: Pick<Grid, "courts" | "rows">,
  slots: readonly { courtId: number; startsAt: string }[],
): string {
  const taken = new Set(slots.map((slot) => pickKey(slot.courtId, instantKey(slot.startsAt))));
  const keyed = new Set(
    grid.rows.flatMap((row) =>
      grid.courts
        .filter((court) => taken.has(pickKey(court.id, instantKey(row.startsAt))))
        .map((court) => pickKey(court.id, row.startsAt)),
    ),
  );
  const groups = groupPicks(grid, keyed);
  if (groups.length === 0) return "Some of your hours were just booked.";
  const hours = groups.reduce((sum, group) => sum + group.labels.length, 0);
  const courts = groups.map((group) => `${group.court.name} at ${joinWithAnd(group.labels)}`);
  return `${joinWithAnd(courts)} ${hours === 1 ? "was" : "were"} just booked.`;
}

/** One spelling of an instant, whatever offset it was written with. */
function instantKey(iso: string): string {
  return new Date(iso).toISOString();
}

/** A run of hours as the receipt reads it, in the venue's time: "5pm to 7pm". */
export function runLabel(run: Pick<BookingRun, "startsAt" | "endsAt">): string {
  const from = formatSlotLabel(localTimeInZone(run.startsAt, VENUE_TIMEZONE));
  const to = formatSlotLabel(localEndTimeInZone(run.endsAt, VENUE_TIMEZONE));
  return `${from} to ${to}`;
}

/** A court's place in the card: the order given, any court not listed after them. */
function courtRank(courtOrder: readonly number[]) {
  return (courtId: number) => {
    const index = courtOrder.indexOf(courtId);
    return index === -1 ? courtOrder.length + courtId : index;
  };
}

/** A run before the hold prices it: adjacent picks on one court. */
export type PickRun = Pick<BookingRun, "courtId" | "startsAt" | "endsAt">;

/**
 * The picks as the checkout card lists them before the hold answers (spec
 * 0015, AC-1): adjacent slots on one court merge into one run, the same way
 * `hold_online_booking` writes its rows. Courts keep the order given, hours
 * run in time order.
 */
export function pickRuns(
  picks: readonly SlotRef[],
  slotMinutes: number,
  courtOrder: readonly number[],
): PickRun[] {
  const slotMs = slotMinutes * 60_000;
  const rank = courtRank(courtOrder);
  const sorted = [...picks]
    .map((pick) => ({ courtId: pick.courtId, start: new Date(pick.startsAt).getTime() }))
    .sort((a, b) => rank(a.courtId) - rank(b.courtId) || a.start - b.start);
  const runs: { courtId: number; start: number; end: number }[] = [];
  for (const pick of sorted) {
    const last = runs.at(-1);
    if (last && last.courtId === pick.courtId && last.end === pick.start) last.end += slotMs;
    else runs.push({ courtId: pick.courtId, start: pick.start, end: pick.start + slotMs });
  }
  return runs.map((run) => ({
    courtId: run.courtId,
    startsAt: new Date(run.start).toISOString(),
    endsAt: new Date(run.end).toISOString(),
  }));
}

/** Runs in the order the card lists them: courts as given, then by time. */
export function sortRuns<T extends PickRun>(
  runs: readonly T[],
  courtOrder: readonly number[],
): T[] {
  const rank = courtRank(courtOrder);
  return [...runs].sort(
    (a, b) =>
      rank(a.courtId) - rank(b.courtId) ||
      new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
}

/** Hours as a number a person reads: 2, 1.5, never 1.4999. */
export function formatHours(hours: number): string {
  return String(Math.round(hours * 100) / 100);
}

/** "1 hour", "3 hours", "1.5 hours": the summary line (spec 0015, AC-1). */
export function hoursText(hours: number): string {
  return `${formatHours(hours)} ${hours === 1 ? "hour" : "hours"}`;
}

/** "2 hr": the chip on one run of the Selected courts and slots card. */
export function hoursChip(hours: number): string {
  return `${formatHours(hours)} hr`;
}

/** How many hours a booking's runs add up to. */
export function runHours(runs: readonly Pick<BookingRun, "startsAt" | "endsAt">[]): number {
  const ms = runs.reduce(
    (sum, run) => sum + (new Date(run.endsAt).getTime() - new Date(run.startsAt).getTime()),
    0,
  );
  return ms / 3_600_000;
}

/**
 * The text a paid player sends when their slot went while the hold was over
 * (spec 0015, AC-13), so staff can find the payment from the message alone.
 */
export function refundSmsBody(code: string, referenceLast4: string): string {
  return `Hi! My online booking ${formatBookingCode(code)} didn't go through after I paid (reference ending ${referenceLast4}). Can you refund me or move my booking?`;
}

/**
 * The text a player sends about a booking they already hold (spec 0017,
 * AC-3, AC-13), so staff can find it from the message alone.
 */
export function bookingCodeSmsBody(code: string): string {
  return `Hi! It's about my booking ${formatBookingCode(code)}.`;
}
