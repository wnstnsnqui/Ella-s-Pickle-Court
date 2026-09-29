import { buildGrid, type ScheduleBlock } from "@/lib/schedule/grid";
import type { Schedule } from "@/lib/schedule/queries";

/**
 * A real `Schedule` for the landing tests, built by `buildGrid` rather than by
 * hand so the fixture can never drift from what `getSchedule()` returns.
 * Two courts, open 6am to 10pm every day, in Manila (UTC+8).
 */

export const WEEK = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  open: "06:00",
  close: "22:00",
}));

export const COURTS = [
  { id: 1, name: "Court 1", note: null, sortOrder: 1 },
  { id: 2, name: "Court 2", note: null, sortOrder: 2 },
];

/** A UTC instant for a Manila local time on `date`. */
export const manila = (date: string, time: string) =>
  new Date(`${date}T${time}:00+08:00`).toISOString();

export function scheduleFixture({
  date = "2026-09-26",
  now = manila("2026-09-26", "15:12"),
  days = WEEK,
  blocks = [],
  courts = COURTS,
  horizonDays = 14,
}: {
  date?: string;
  now?: string;
  days?: typeof WEEK | { dayOfWeek: number; open: string | null; close: string | null }[];
  blocks?: ScheduleBlock[];
  courts?: typeof COURTS;
  horizonDays?: number;
} = {}): Schedule {
  const settings = {
    days,
    slotMinutes: 60,
    bookingHorizonDays: horizonDays,
    timezone: "Asia/Manila",
    version: 1,
  };
  return {
    grid: buildGrid({ date, settings, courts, blocks }),
    settingsVersion: 1,
    horizonDays,
    now,
    hours: { days },
  };
}
