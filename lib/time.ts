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
/** The one time past `23:59` that means anything: the end of the day (spec 0007, AC-10). */
const MIDNIGHT_END = "24:00";

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
 *
 * `24:00` is accepted as the end of the day (spec 0007, AC-10): it resolves to
 * the first instant of the next local day, which is where a closing time of
 * midnight, and a booking that ends then, has to land.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  if (!CALENDAR_DATE.test(date)) throw new RangeError(`Not a calendar date: ${date}`);
  if (time === MIDNIGHT_END) return zonedTimeToUtc(addDays(date, 1), "00:00", timeZone);
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

/** The venue local `HH:mm` an instant falls at, the shape the schemas accept. */
export function localTimeInZone(instant: Date | string, timeZone: string): string {
  const parts = partFormatter(timeZone).formatToParts(
    typeof instant === "string" ? new Date(instant) : instant,
  );
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("hour")}:${read("minute")}`;
}

/**
 * The venue local `HH:mm` an end instant falls at, with the end of the day read
 * as `24:00` (spec 0007, AC-10). No slot ever ends at `00:00` in the middle of
 * a day, because an open time is always before midnight, so an end that lands
 * on the stroke of midnight is always the end of the previous day.
 */
export function localEndTimeInZone(instant: Date | string, timeZone: string): string {
  const time = localTimeInZone(instant, timeZone);
  return time === "00:00" ? MIDNIGHT_END : time;
}

/** Today at the venue, which is what an empty date parameter means. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return calendarDateInZone(now, timeZone);
}

/**
 * Which day of the week a calendar date falls on, `0` for Sunday through `6`
 * for Saturday. A calendar date already names its own day, so no zone is needed
 * once you have it.
 *
 * `0` is Sunday because that is what both `getUTCDay()` and Postgres
 * `extract(dow)` say, so `venue_hours.day_of_week` needs no translation at any
 * boundary (spec 0007, AC-16).
 */
export function dayOfWeek(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Move a calendar date by whole days without ever touching a timezone. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return moved.toISOString().slice(0, 10);
}

/**
 * A calendar date as a `Date` at local midnight, the identity `react-day-picker`
 * compares days by (year, month, day on the reader's own device, never a zone
 * conversion). Spec 0011, AC-2: this is what lets the calendar mark "today" and
 * "selected" without disagreeing with the venue's day.
 */
export function calendarDateToLocalDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * The reverse of {@link calendarDateToLocalDate}: `react-day-picker`'s own local
 * year/month/day fields back to `YYYY-MM-DD`. Never routed through a timezone,
 * so a device west of the venue still writes the day it shows, not the day
 * before (spec 0011, AC-2).
 */
export function localDateToCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
 *
 * `24:00` is the one label that is not a moment in the day but the end of it
 * (spec 0007, AC-8), so it reads as Midnight rather than as another 12.
 */
export function formatSlotLabel(label: string): string {
  if (label === MIDNIGHT_END) return "Midnight";
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

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * "Sat 20 Sep" from a calendar date (spec 0006, AC-11). Built from fixed names
 * rather than a locale, so a page title reads the same on every server build.
 * A calendar date already names its weekday, so noon UTC of that date is safe
 * in every zone.
 */
export function formatDayHeading(date: string): string {
  const at = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) throw new RangeError(`Not a calendar date: ${date}`);
  return `${WEEKDAY_NAMES[at.getUTCDay()]} ${at.getUTCDate()} ${MONTH_NAMES[at.getUTCMonth()]}`;
}
