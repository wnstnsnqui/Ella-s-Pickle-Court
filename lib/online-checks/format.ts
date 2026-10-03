import {
  calendarDateInZone,
  formatDayHeading,
  formatSlotLabel,
  localEndTimeInZone,
  localTimeInZone,
} from "@/lib/time";

import type { OnlineRun } from "./types";

/**
 * How the staff check says a run, a time and an amount (spec 0016). Pure, so
 * the list, the sheet, the toast and the player message all say it the same
 * way, always in the venue's timezone, never the device's.
 */

/** "₱1,000", or "₱500.50" when there are centavos. */
export function formatAmount(amount: number): string {
  const whole = Number.isInteger(amount);
  return `₱${amount.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "Fri 30 Oct", the venue day an instant falls on. */
export function formatVenueDay(instant: string, timeZone: string): string {
  return formatDayHeading(calendarDateInZone(new Date(instant), timeZone));
}

/** "6pm", a start in the grid's own compact labels. */
export function formatStart(instant: string, timeZone: string): string {
  return formatSlotLabel(localTimeInZone(instant, timeZone));
}

/** "Court 2 · Fri 30 Oct · 6pm to 8pm" (AC-2, AC-6). */
export function formatRun(run: OnlineRun, timeZone: string): string {
  const end = formatSlotLabel(localEndTimeInZone(run.endsAt, timeZone));
  return `${run.courtName} · ${formatVenueDay(run.startsAt, timeZone)} · ${formatStart(run.startsAt, timeZone)} to ${end}`;
}

/** "Fri 30 Oct, 6pm", the first run as the player message names it (AC-9). */
export function formatRunStart(run: OnlineRun, timeZone: string): string {
  return `${formatVenueDay(run.startsAt, timeZone)}, ${formatStart(run.startsAt, timeZone)}`;
}

/** "Court 2, Fri 30 Oct, 6pm", for the new booking toast (AC-5). */
export function formatRunForToast(run: OnlineRun, timeZone: string): string {
  return `${run.courtName}, ${formatRunStart(run, timeZone)}`;
}

/** "Sat 31 Oct, 9:05am", when a decision was made (AC-6). */
export function formatEventStamp(instant: string, timeZone: string): string {
  return formatRunStart(
    { courtId: 0, courtName: "", startsAt: instant, endsAt: instant },
    timeZone,
  );
}

/** A row as the merge below reads it. */
export type RunRow = { courtId: number; courtName: string; startsAt: string; endsAt: string };

/**
 * Rows into runs: earliest first, and two rows on one court that meet end to
 * start become one run (an edit can split a run into two rows).
 */
export function mergeRuns(rows: readonly RunRow[]): OnlineRun[] {
  const sorted = [...rows].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.courtId - b.courtId,
  );
  const runs: OnlineRun[] = [];
  for (const row of sorted) {
    const joins = runs.find(
      (run) => run.courtId === row.courtId && Date.parse(run.endsAt) === Date.parse(row.startsAt),
    );
    if (joins) joins.endsAt = row.endsAt;
    else runs.push({ ...row });
  }
  return runs;
}

/** "+2 more" when a booking has more runs than the one shown, else null. */
export function moreRuns(runs: readonly OnlineRun[]): string | null {
  return runs.length > 1 ? `+${runs.length - 1} more` : null;
}
