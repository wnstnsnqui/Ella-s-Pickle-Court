import { VENUE_TIMEZONE } from "./env";

/**
 * Time helpers for spec 0001.
 *
 * Architecture rule 8: every timestamp is stored as `timestamptz` in UTC. Local
 * time exists only at the moment something is shown to a person, and it is always
 * the venue timezone, never the reader's device.
 */

/** Format an instant for display at the venue. */
export function formatAtVenue(
  value: Date | string,
  options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  },
): string {
  const instant = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-PH", {
    ...options,
    timeZone: VENUE_TIMEZONE,
  }).format(instant);
}

/**
 * Timezone helpers for spec 0002.
 *
 * The grid is generated in the venue's timezone, never in UTC and never in the
 * reader's own. Everything below takes the timezone as an argument because the
 * real one lives in `venue_settings.timezone`, not in a constant.
 */

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** How far ahead of UTC the zone is at that instant, in milliseconds. */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = partFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asIfUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Turn a calendar date plus a local `HH:mm` in the venue's zone into the UTC
 * instant that gets stored. Times cross the wire as these two fields precisely
 * so no client timezone can get a say in the answer.
 *
 * The offset is resolved twice because the first guess is read at the wrong
 * instant when a zone changes offset. `Asia/Manila` never does, but a venue in
 * a zone that does would otherwise be an hour out twice a year.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  if (!CALENDAR_DATE.test(date)) throw new RangeError(`Not a calendar date: ${date}`);
  if (!LOCAL_TIME.test(time)) throw new RangeError(`Not a local time: ${time}`);
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let instant = naive - zoneOffsetMs(new Date(naive), timeZone);
  instant = naive - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** The calendar date an instant falls on, as seen at the venue. */
export function calendarDateInZone(instant: Date, timeZone: string): string {
  const parts = partFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

/** Today at the venue, which is what an empty date parameter means. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return calendarDateInZone(now, timeZone);
}

/**
 * Whether a calendar date is a Saturday or a Sunday. A calendar date already
 * names a day of the week on its own, so no zone is needed once you have it.
 */
export function isWeekend(date: string): boolean {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** Move a calendar date by whole days without ever touching a timezone. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return moved.toISOString().slice(0, 10);
}

/** Whole days from one calendar date to another, `to` minus `from`. */
export function daysBetween(from: string, to: string): number {
  const parse = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** `HH:mm` as minutes past midnight, the unit slot generation counts in. */
export function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/** Minutes past midnight back to `HH:mm`, for the labels down the side. */
export function minutesToTime(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** A Postgres `time` column arrives as `HH:mm:ss`; the grid works in `HH:mm`. */
export function trimSeconds(time: string): string {
  return time.slice(0, 5);
}

/**
 * The compact 12 hour label down the side of the grid. Spec 0003, AC-9.
 *
 * The rule is deliberately terse, because the time column is the narrowest thing
 * on a phone: `9am` on the hour, `12nn` at noon, `12mn` at midnight, and minutes
 * only when there are any, `4:30pm`. `nn` and `mn` are the Philippine shorthand
 * for noon and midnight, which is what a reader at this venue expects.
 *
 * The input is a `GridRow.label`, which spec 0002 already fixed as `HH:mm` in the
 * venue's timezone, so this is pure formatting: it never re-derives a time and
 * never touches the reader's own clock.
 */
export function formatSlotLabel(label: string): string {
  const [hour, minute] = label.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new RangeError(`Not a local time: ${label}`);
  }
  if (minute === 0 && hour === 12) return "12nn";
  if (minute === 0 && hour === 0) return "12mn";

  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "am" : "pm";
  return minute === 0
    ? `${twelve}${suffix}`
    : `${twelve}:${String(minute).padStart(2, "0")}${suffix}`;
}
