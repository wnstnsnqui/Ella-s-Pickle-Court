import {
  calendarDateInZone,
  dayOfWeek,
  daysBetween,
  localEndTimeInZone,
  localTimeInZone,
} from "@/lib/time";

import type { VenueDay } from "./grid";

/**
 * Which bookings a change of hours would strand. Spec 0007, AC-9.
 *
 * Pure, so it can be tested against a handful of rows with no database. A
 * booking is measured against the proposed pair for its own day of the week,
 * read in the venue's zone: outside when it starts before the open or ends
 * after the close. An end on the stroke of midnight reads as `24:00`, so a
 * booking that runs to the end of the day fits a close of `24:00`. A row that
 * spans more than one venue day is outside by definition, because no pair of
 * hours covers it, and so is every row on a day the proposal marks closed,
 * because a closed day has no hours to be inside (revised 2026-09-22).
 */
export type BookingRange = {
  startsAt: string;
  endsAt: string;
};

export function isOutsideHours(
  row: BookingRange,
  days: readonly VenueDay[],
  timezone: string,
): boolean {
  const startDate = calendarDateInZone(new Date(row.startsAt), timezone);
  const endTime = localEndTimeInZone(row.endsAt, timezone);
  const endDate = calendarDateInZone(new Date(row.endsAt), timezone);
  // `24:00` lands on the next calendar day; anything else on a later day spans two.
  const endsOnStartDay =
    endDate === startDate || (endTime === "24:00" && daysBetween(startDate, endDate) === 1);
  if (!endsOnStartDay) return true;

  const day = days.find((entry) => entry.dayOfWeek === dayOfWeek(startDate));
  // No row for the day, or a day with no times, is closed: nothing can be
  // inside hours that do not exist.
  if (!day || day.open === null || day.close === null) return true;

  const startTime = localTimeInZone(row.startsAt, timezone);
  // `HH:mm` strings order the same way the times do, `24:00` included.
  return startTime < day.open || endTime > day.close;
}

export function countOutsideHours(
  rows: readonly BookingRange[],
  days: readonly VenueDay[],
  timezone: string,
): number {
  return rows.filter((row) => isOutsideHours(row, days, timezone)).length;
}
