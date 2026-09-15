import { addDays } from "@/lib/time";

/**
 * Turning a preset into a resolved range, for spec 0008, AC-2.
 *
 * Pure and zone free: `today` is passed in already resolved to the venue's
 * zone (`todayInZone("Asia/Manila")`), so everything here is calendar date
 * arithmetic in UTC, the same trick `lib/time.ts` uses everywhere else.
 */

export const REPORT_RANGE_PRESETS = [
  "last-7-days",
  "last-30-days",
  "last-90-days",
  "this-week",
  "last-week",
  "this-month",
  "last-month",
  "last-12-months",
] as const;

export type ReportRangePreset = (typeof REPORT_RANGE_PRESETS)[number];

export const DEFAULT_REPORT_RANGE: ReportRangePreset = "last-30-days";

export const REPORT_RANGE_LABELS: Record<ReportRangePreset, string> = {
  "last-7-days": "Last 7 days",
  "last-30-days": "Last 30 days",
  "last-90-days": "Last 90 days",
  "this-week": "This week",
  "last-week": "Last week",
  "this-month": "This month",
  "last-month": "Last month",
  "last-12-months": "Last 12 months",
};

export type ResolvedRange = { from: string; to: string };

function weekdayOf(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** The Monday on or before `date`, so a week always runs Monday to Sunday. */
function mondayOf(date: string): string {
  const sinceMonday = (weekdayOf(date) + 6) % 7;
  return addDays(date, -sinceMonday);
}

function parts(date: string): [number, number] {
  const [year, month] = date.split("-").map(Number);
  return [year, month];
}

/** `month` is the calendar month, 1 to 12; negative or over 12 rolls the year. */
function firstOfMonthOffset(date: string, monthsBack: number): string {
  const [year, month] = parts(date);
  return new Date(Date.UTC(year, month - 1 - monthsBack, 1)).toISOString().slice(0, 10);
}

export function resolveRange(preset: ReportRangePreset, today: string): ResolvedRange {
  switch (preset) {
    case "last-7-days":
      return { from: addDays(today, -6), to: today };
    case "last-30-days":
      return { from: addDays(today, -29), to: today };
    case "last-90-days":
      return { from: addDays(today, -89), to: today };
    case "this-week":
      return { from: mondayOf(today), to: today };
    case "last-week": {
      const lastMonday = addDays(mondayOf(today), -7);
      return { from: lastMonday, to: addDays(lastMonday, 6) };
    }
    case "this-month":
      return { from: firstOfMonthOffset(today, 0), to: today };
    case "last-month":
      return { from: firstOfMonthOffset(today, 1), to: addDays(firstOfMonthOffset(today, 0), -1) };
    case "last-12-months":
      return { from: firstOfMonthOffset(today, 11), to: today };
  }
}
