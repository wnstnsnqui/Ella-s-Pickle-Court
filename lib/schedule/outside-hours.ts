import {
  calendarDateInZone,
  daysBetween,
  isWeekend,
  localEndTimeInZone,
  localTimeInZone,
} from "@/lib/time";

import type { VenueHours } from "./queries";

/**
 * Which bookings a change of hours would strand. Spec 0007, AC-9.
 *
 * Pure, so it can be tested against a handful of rows with no database. A
 * booking is measured against the proposed pair for its own weekday, read in
 * the venue's zone: outside when it starts before the open or ends after the
 * close. An end on the stroke of midnight reads as `24:00`, so a booking that
 * runs to the end of the day fits a close of `24:00`. A row that spans more
 * than one venue day is outside by definition, because no pair of hours
 * covers it.
 */
export type BookingRange = {
  startsAt: string;
  endsAt: string;
};

export function isOutsideHours(row: BookingRange, hours: VenueHours, timezone: string): boolean {
  const startDate = calendarDateInZone(new Date(row.startsAt), timezone);
  const endTime = localEndTimeInZone(row.endsAt, timezone);
  const endDate = calendarDateInZone(new Date(row.endsAt), timezone);
  // `24:00` lands on the next calendar day; anything else on a later day spans two.
  const endsOnStartDay =
    endDate === startDate || (endTime === "24:00" && daysBetween(startDate, endDate) === 1);
  if (!endsOnStartDay) return true;

  const weekend = isWeekend(startDate);
  const open = weekend ? hours.weekendOpen : hours.weekdayOpen;
  const close = weekend ? hours.weekendClose : hours.weekdayClose;
  const startTime = localTimeInZone(row.startsAt, timezone);
  // `HH:mm` strings order the same way the times do, `24:00` included.
  return startTime < open || endTime > close;
}

export function countOutsideHours(
  rows: readonly BookingRange[],
  hours: VenueHours,
  timezone: string,
): number {
  return rows.filter((row) => isOutsideHours(row, hours, timezone)).length;
}
