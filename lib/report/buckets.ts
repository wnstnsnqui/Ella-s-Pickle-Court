import { addDays, dayOfWeek, daysBetween, timeToMinutes } from "@/lib/time";

/**
 * Folding `court_usage` rows into the shapes the report renders. Spec 0008,
 * AC-5 and AC-7. Every function here is pure, so it is unit tested on fixed
 * rows with no database.
 */

export type UsageRow = { courtId: number; localDate: string; hour: number; bookedMinutes: number };

/**
 * The week the report measures against, one entry per day of the week (spec
 * 0007, AC-23). A day with no times is closed and contributes no open minutes.
 */
export type ReportHours = {
  days: { dayOfWeek: number; open: string | null; close: string | null }[];
};

export type HourBucket = {
  hour: number;
  bookedMinutes: number;
  openMinutes: number;
  utilisationPercent: number;
};

export type DayBucket = {
  date: string;
  bookedMinutes: number;
  openMinutes: number;
  utilisationPercent: number;
};

export type WeekdayHourCell = {
  weekday: number;
  hour: number;
  bookedMinutes: number;
  openMinutes: number;
  utilisationPercent: number;
};

export type ReportTotals = {
  bookedMinutes: number;
  openMinutes: number;
  utilisationPercent: number;
  busiestHour: number | null;
  busiestDate: string | null;
};

/** Monday to Sunday, the order the weekday by hour heatmap reads in (spec 0008, Decision). */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function weekdayOf(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Every calendar date from `from` to `to`, inclusive. */
export function datesInRange(from: string, to: string): string[] {
  const count = daysBetween(from, to);
  return Array.from({ length: count + 1 }, (_, index) => addDays(from, index));
}

/** The pair that applies to a date, or `null` when that day is closed. */
function openPair(date: string, hours: ReportHours): { open: string; close: string } | null {
  const day = hours.days.find((entry) => entry.dayOfWeek === dayOfWeek(date));
  if (!day || day.open === null || day.close === null) return null;
  return { open: day.open, close: day.close };
}

/**
 * Minutes the venue is open on one date, across `courtsCount` courts. A closed
 * day is zero, so it neither inflates nor deflates utilisation (AC-23).
 */
export function openMinutesForDate(date: string, hours: ReportHours, courtsCount: number): number {
  const pair = openPair(date, hours);
  if (pair === null) return 0;
  return Math.max(0, timeToMinutes(pair.close) - timeToMinutes(pair.open)) * courtsCount;
}

/** How many of `dates` have `hour` inside their own day's pair. A closed date has none. */
function openDaysForHour(hour: number, dates: readonly string[], hours: ReportHours): number {
  const hourStart = hour * 60;
  return dates.filter((date) => {
    const pair = openPair(date, hours);
    if (pair === null) return false;
    return hourStart >= timeToMinutes(pair.open) && hourStart < timeToMinutes(pair.close);
  }).length;
}

function utilisationPercent(bookedMinutes: number, openMinutes: number): number {
  if (openMinutes <= 0) return 0;
  return Math.min(100, Math.round((bookedMinutes / openMinutes) * 100));
}

/** Booked minutes per hour of day, summed over the range. */
export function byHour(
  rows: readonly UsageRow[],
  dates: readonly string[],
  hours: ReportHours,
  courtsCount: number,
): HourBucket[] {
  const perHour = new Array<number>(24).fill(0);
  for (const row of rows) perHour[row.hour] += row.bookedMinutes;
  return perHour.map((bookedMinutes, hour) => {
    const openMinutes = openDaysForHour(hour, dates, hours) * 60 * courtsCount;
    return {
      hour,
      bookedMinutes,
      openMinutes,
      utilisationPercent: utilisationPercent(bookedMinutes, openMinutes),
    };
  });
}

/** Booked minutes per local date, every date in the range present even at zero. */
export function byDay(
  rows: readonly UsageRow[],
  dates: readonly string[],
  hours: ReportHours,
  courtsCount: number,
): DayBucket[] {
  const perDate = new Map<string, number>(dates.map((date) => [date, 0]));
  for (const row of rows)
    perDate.set(row.localDate, (perDate.get(row.localDate) ?? 0) + row.bookedMinutes);
  return dates.map((date) => {
    const bookedMinutes = perDate.get(date) ?? 0;
    const openMinutes = openMinutesForDate(date, hours, courtsCount);
    return {
      date,
      bookedMinutes,
      openMinutes,
      utilisationPercent: utilisationPercent(bookedMinutes, openMinutes),
    };
  });
}

/**
 * A 7 by 24 grid of booked minutes, Monday to Sunday down the side, each cell
 * carrying its own utilisation: open minutes counts only the dates in range
 * that fall on that cell's weekday and have that hour inside their own
 * weekday or weekend pair.
 */
export function byWeekdayHour(
  rows: readonly UsageRow[],
  dates: readonly string[],
  hours: ReportHours,
  courtsCount: number,
): WeekdayHourCell[] {
  const perCell = new Map<string, number>();
  for (const row of rows) {
    const key = `${weekdayOf(row.localDate)}-${row.hour}`;
    perCell.set(key, (perCell.get(key) ?? 0) + row.bookedMinutes);
  }
  const datesByWeekday = new Map<number, string[]>();
  for (const date of dates) {
    const weekday = weekdayOf(date);
    const list = datesByWeekday.get(weekday) ?? [];
    list.push(date);
    datesByWeekday.set(weekday, list);
  }
  const cells: WeekdayHourCell[] = [];
  for (const weekday of WEEKDAY_ORDER) {
    const datesForWeekday = datesByWeekday.get(weekday) ?? [];
    for (let hour = 0; hour < 24; hour += 1) {
      const bookedMinutes = perCell.get(`${weekday}-${hour}`) ?? 0;
      const openMinutes = openDaysForHour(hour, datesForWeekday, hours) * 60 * courtsCount;
      cells.push({
        weekday,
        hour,
        bookedMinutes,
        openMinutes,
        utilisationPercent: utilisationPercent(bookedMinutes, openMinutes),
      });
    }
  }
  return cells;
}

/**
 * Booked minutes, open minutes, utilisation, the busiest hour, and the
 * single busiest calendar date. Ties go to the earliest hour, and to the
 * earliest date in `dates` order.
 */
export function totals(
  rows: readonly UsageRow[],
  dates: readonly string[],
  hours: ReportHours,
  courtsCount: number,
): ReportTotals {
  const bookedMinutes = rows.reduce((sum, row) => sum + row.bookedMinutes, 0);
  const openMinutes = dates.reduce(
    (sum, date) => sum + openMinutesForDate(date, hours, courtsCount),
    0,
  );

  const perHour = new Array<number>(24).fill(0);
  for (const row of rows) perHour[row.hour] += row.bookedMinutes;
  let busiestHour: number | null = null;
  let busiestHourMinutes = 0;
  perHour.forEach((minutes, hour) => {
    if (minutes > busiestHourMinutes) {
      busiestHourMinutes = minutes;
      busiestHour = hour;
    }
  });

  const perDate = new Map<string, number>();
  for (const row of rows) {
    perDate.set(row.localDate, (perDate.get(row.localDate) ?? 0) + row.bookedMinutes);
  }
  let busiestDate: string | null = null;
  let busiestDateMinutes = 0;
  for (const date of dates) {
    const minutes = perDate.get(date) ?? 0;
    if (minutes > busiestDateMinutes) {
      busiestDateMinutes = minutes;
      busiestDate = date;
    }
  }

  return {
    bookedMinutes,
    openMinutes,
    utilisationPercent: utilisationPercent(bookedMinutes, openMinutes),
    busiestHour,
    busiestDate,
  };
}

/**
 * The hours the by hour chart and the heatmap show. Spec 0008, AC-7, revised by
 * spec 0007, AC-23: from the earliest open time to the latest close time across
 * the days the venue is open, widened to include any hour that has booked
 * minutes so out of hours use is shown rather than clipped. A week with no open
 * day falls back to the usual `06:00` to `22:00` shape.
 */
export function hourAxis(hours: ReportHours, rows: readonly UsageRow[]): number[] {
  const opens = hours.days
    .filter((day) => day.open !== null && day.close !== null)
    .map((day) => ({
      open: timeToMinutes(day.open as string),
      close: timeToMinutes(day.close as string),
    }));

  let startHour = opens.length === 0 ? 6 : Math.floor(Math.min(...opens.map((p) => p.open)) / 60);
  let endHourExclusive =
    opens.length === 0 ? 22 : Math.ceil(Math.max(...opens.map((p) => p.close)) / 60);

  for (const row of rows) {
    if (row.bookedMinutes <= 0) continue;
    if (row.hour < startHour) startHour = row.hour;
    if (row.hour + 1 > endHourExclusive) endHourExclusive = row.hour + 1;
  }

  startHour = Math.max(0, startHour);
  endHourExclusive = Math.min(24, endHourExclusive);
  return Array.from(
    { length: Math.max(0, endHourExclusive - startHour) },
    (_, index) => startHour + index,
  );
}
