import { formatSlotLabel, trimSeconds } from "@/lib/time";

import type { VenueDay } from "./grid";

/**
 * The week's opening hours, grouped the way a person reads them. Spec 0007,
 * AC-21 and spec 0013, AC-18.
 *
 * One helper for both readers, the JSON-LD block and the landing page's Visit
 * card, so a search result and the page can never list the week differently.
 */

/** Indexed by `day_of_week`, so `0` is Sunday, as the table stores it. */
export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Monday first through Sunday, the order the days are listed in. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export type HoursGroup = {
  /** `HH:mm`, or both null for the days the venue is closed. */
  open: string | null;
  close: string | null;
  /** Days of the week in this group, Monday first. */
  days: number[];
};

/**
 * One group per distinct pair of times, with every day sharing that pair in
 * it, whether or not the days sit next to each other. Closed days form one
 * group of their own. Groups come out in the order their first day appears,
 * Monday first, so the list and the JSON-LD both diff cleanly.
 */
export function groupOpeningHours(days: readonly VenueDay[]): HoursGroup[] {
  const byPair = new Map<string, HoursGroup>();

  for (const dayOfWeek of WEEK_ORDER) {
    const day = days.find((entry) => entry.dayOfWeek === dayOfWeek);
    const open = day && day.open !== null && day.close !== null ? trimSeconds(day.open) : null;
    const close = open !== null && day?.close ? trimSeconds(day.close) : null;
    const key = open === null ? "closed" : `${open}|${close}`;
    const group = byPair.get(key);
    if (group) group.days.push(dayOfWeek);
    else byPair.set(key, { open, close, days: [dayOfWeek] });
  }

  return [...byPair.values()];
}

/**
 * "Monday to Friday", "Saturday and Sunday", "Monday, Wednesday and Friday":
 * runs of three or more next to each other read as a span.
 */
export function daysLabel(days: readonly number[]): string {
  const positions = days.map((day) => WEEK_ORDER.indexOf(day as (typeof WEEK_ORDER)[number]));
  const runs: number[][] = [];
  for (const position of positions) {
    const run = runs.at(-1);
    if (run && run.at(-1) === position - 1) run.push(position);
    else runs.push([position]);
  }

  const parts = runs.flatMap((run) => {
    const names = run.map((position) => DAY_NAMES[WEEK_ORDER[position]]);
    return names.length >= 3 ? [`${names[0]} to ${names.at(-1)}`] : names;
  });

  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** "6am to 10pm", or "Closed". */
export function hoursLabel(group: Pick<HoursGroup, "open" | "close">): string {
  if (group.open === null || group.close === null) return "Closed";
  return `${formatSlotLabel(group.open)} to ${formatSlotLabel(group.close)}`;
}

/**
 * The earliest opening time across the week, `HH:mm`, or null when every day
 * is closed (spec 0013, AC-16). The hero's "Earliest serve" stat.
 */
export function earliestOpen(days: readonly VenueDay[]): string | null {
  let earliest: string | null = null;
  for (const day of days) {
    if (day.open === null || day.close === null) continue;
    const open = trimSeconds(day.open);
    if (earliest === null || open < earliest) earliest = open;
  }
  return earliest;
}
