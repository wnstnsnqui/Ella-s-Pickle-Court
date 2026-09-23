import {
  addDays,
  dayOfWeek,
  localTimeInZone,
  minutesToTime,
  timeToMinutes,
  trimSeconds,
  zonedTimeToUtc,
} from "@/lib/time";

import type { CellState, ReservationKind } from "./constants";

/**
 * The grid derivation for spec 0002, AC-5 and AC-11.
 *
 * Invariant 7: availability is never stored. A cell's label is worked out here,
 * every time, from the opening hours plus the reservations that actually exist.
 * Everything is pure and takes the timezone from the settings row, so the whole
 * module is testable with no database and no dependency on where the server is.
 */

/** The four columns the public read is allowed to see. */
export type ScheduleBlock = {
  courtId: number;
  startsAt: string;
  endsAt: string;
  kind: ReservationKind;
};

export type GridCourt = {
  id: number;
  name: string;
  note: string | null;
  sortOrder: number;
};

/**
 * One row of `venue_hours`. Both times set means open; both null means closed
 * all day. There is no third state (spec 0007, invariant 9).
 */
export type VenueDay = {
  /** `0` is Sunday, matching `getUTCDay()` and Postgres `extract(dow)`. */
  dayOfWeek: number;
  open: string | null;
  close: string | null;
};

export type VenueSettings = {
  /** Seven entries, ordered `0` to `6` (spec 0007, AC-18). */
  days: VenueDay[];
  slotMinutes: number;
  bookingHorizonDays: number;
  timezone: string;
  version: number;
};

/** The fallback span for a week with no open day at all (spec 0007, AC-20). */
const FALLBACK_SPAN = { open: "06:00", close: "22:00" } as const;

export type GridCell = {
  courtId: number;
  state: CellState;
  /** Which blocks landed on this cell, so a staff screen can open one. */
  blocks: number[];
};

export type GridRow = {
  /** UTC instants, because that is what everything is compared in. */
  startsAt: string;
  endsAt: string;
  /** The venue local `HH:mm` shown down the side of the grid. */
  label: string;
  /** AC-11: a booking outside opening hours gets its own row, marked. */
  outOfHours: boolean;
  cells: GridCell[];
};

export type Grid = {
  date: string;
  timezone: string;
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  /**
   * Whether the venue is closed all day (spec 0007, AC-19, AC-20). The boards
   * read this to say so plainly; `openTime` and `closeTime` then hold the
   * closed day span rather than hours anybody can book in.
   */
  closed: boolean;
  courts: GridCourt[];
  rows: GridRow[];
};

/** The UTC instants a venue local calendar day starts and ends at. */
export function dayBoundsUtc(date: string, timezone: string): { start: Date; end: Date } {
  return {
    start: zonedTimeToUtc(date, "00:00", timezone),
    end: zonedTimeToUtc(addDays(date, 1), "00:00", timezone),
  };
}

/**
 * Which pair of opening hours applies, looked up by the date's own day of the
 * week. `null` means the venue is closed that day (spec 0007, AC-18).
 */
export function openingHours(
  date: string,
  settings: VenueSettings,
): { open: string; close: string } | null {
  const day = settings.days.find((entry) => entry.dayOfWeek === dayOfWeek(date));
  if (!day || day.open === null || day.close === null) return null;
  return { open: trimSeconds(day.open), close: trimSeconds(day.close) };
}

/**
 * How tall a closed day's grid is: the earliest open and the latest close
 * across the days the venue is open, falling back to `06:00` to `22:00` when
 * every day is closed (spec 0007, AC-20).
 *
 * A closed day has no hours of its own, and twenty four rows of grey is worse
 * than the venue's usual shape greyed out. One helper, so the two boards and
 * the tests cannot disagree about it.
 */
export function weekSpan(days: VenueDay[]): { open: string; close: string } {
  let open: number | null = null;
  let close: number | null = null;

  for (const day of days) {
    if (day.open === null || day.close === null) continue;
    const dayOpen = timeToMinutes(trimSeconds(day.open));
    const dayClose = timeToMinutes(trimSeconds(day.close));
    if (open === null || dayOpen < open) open = dayOpen;
    if (close === null || dayClose > close) close = dayClose;
  }

  if (open === null || close === null) return { ...FALLBACK_SPAN };
  return { open: minutesToTime(open), close: closeLabel(close) };
}

/**
 * `minutesToTime` wraps at the day, which is right for a slot label and wrong
 * for a closing time: the end of the day is `24:00`, never `00:00` (spec 0007,
 * AC-10).
 */
function closeLabel(minutes: number): string {
  return minutes >= 1440 ? "24:00" : minutesToTime(minutes);
}

/**
 * Which days of the week the venue is closed, `0` for Sunday. What the date
 * picker mutes (spec 0007, AC-22).
 */
export function closedDaysOf(hours: { days: VenueDay[] }): number[] {
  return hours.days
    .filter((day) => day.open === null || day.close === null)
    .map((day) => day.dayOfWeek);
}

/** Half open overlap, the same rule `tstzrange(..., '[)')` uses in Postgres. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function stateFor(
  blocks: ScheduleBlock[],
  courtId: number,
  rowStart: number,
  rowEnd: number,
  insideOpeningHours: boolean,
): GridCell {
  const hits: number[] = [];
  let closed = false;
  let booked = false;

  blocks.forEach((block, index) => {
    if (block.courtId !== courtId) return;
    const start = Date.parse(block.startsAt);
    const end = Date.parse(block.endsAt);
    if (!overlaps(rowStart, rowEnd, start, end)) return;
    hits.push(index);
    if (block.kind === "closed") closed = true;
    else booked = true;
  });

  // AC-5, in the order the spec fixes: closed wins, then booked, then whether
  // the venue is even open at that hour.
  let state: CellState;
  if (closed) state = "unavailable";
  else if (booked) state = "booked";
  else state = insideOpeningHours ? "available" : "unavailable";

  return { courtId, state, blocks: hits };
}

/**
 * Turn a day, the settings, the courts and the day's blocks into the grid.
 *
 * Slot rows run from the opening time to the closing time in whole slots. A
 * trailing partial slot is dropped, so the grid never offers an hour that
 * cannot be booked in full. Blocks that fall outside those hours, which happens
 * when Ella shortens the day after somebody booked, get their own rows so a
 * booking can never silently vanish off the grid.
 *
 * A closed day (spec 0007, AC-18) has no hours of its own. It takes its span
 * from `closedDaySpan`, which the caller derives once with {@link weekSpan},
 * and every row is marked as outside opening hours, so the hours layer of the
 * cell state reads `unavailable` throughout while a booking on it still reads
 * `booked` (AC-20). The rows are always built: it is the staff board that
 * renders none on a closed day with nothing on it (AC-19), because the public
 * board needs the greyed grid the same day.
 */
export function buildGrid(input: {
  date: string;
  settings: VenueSettings;
  courts: GridCourt[];
  blocks: ScheduleBlock[];
  /** The closed day span, from {@link weekSpan}. Only read on a closed day. */
  closedDaySpan?: { open: string; close: string };
}): Grid {
  const { date, settings, blocks } = input;
  const courts = [...input.courts].sort((a, b) => a.sortOrder - b.sortOrder);
  const hours = openingHours(date, settings);
  const isClosed = hours === null;
  const timezone = settings.timezone;

  const { open, close } = hours ?? {
    // Widened at both ends to cover any reservation on the date, so a booking
    // stranded by closing the day stays inside the rows rather than trailing
    // below them (AC-20).
    ...widenToBlocks(
      input.closedDaySpan ?? weekSpan(settings.days),
      blocks,
      date,
      timezone,
      settings.slotMinutes,
    ),
  };

  const openMinutes = timeToMinutes(open);
  const closeMinutes = timeToMinutes(close);
  const openInstant = zonedTimeToUtc(date, open, timezone).getTime();
  const closeInstant = zonedTimeToUtc(date, close, timezone).getTime();

  const inHoursRanges: Array<{ start: number; end: number; label: string; outOfHours: boolean }> =
    [];

  for (
    let minute = openMinutes;
    minute + settings.slotMinutes <= closeMinutes;
    minute += settings.slotMinutes
  ) {
    const label = minutesToTime(minute);
    const start = zonedTimeToUtc(date, label, timezone).getTime();
    const end = start + settings.slotMinutes * 60_000;
    // On a closed day every hour is outside opening hours, so these rows carry
    // the same flag and the same grey treatment an out of hours row already has
    // (AC-18, AC-20). They stay in slot order rather than being appended.
    inHoursRanges.push({ start, end, label, outOfHours: isClosed });
  }

  // AC-11. One extra row per distinct out of hours range, so two courts closed
  // over the same early morning stretch share a row rather than doubling it.
  // These always render below the closing time row, never mixed above it, so
  // sort them among themselves but keep them after every in hours row.
  const outOfHoursRanges: Array<{
    start: number;
    end: number;
    label: string;
    outOfHours: boolean;
  }> = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const start = Date.parse(block.startsAt);
    const end = Date.parse(block.endsAt);
    if (start >= openInstant && end <= closeInstant) continue;
    const key = `${start}-${end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    outOfHoursRanges.push({
      start,
      end,
      label: localTimeInZone(new Date(start), timezone),
      outOfHours: true,
    });
  }

  outOfHoursRanges.sort((a, b) => a.start - b.start || a.end - b.end);

  const slotRanges = [...inHoursRanges, ...outOfHoursRanges];

  const rows: GridRow[] = slotRanges.map((slot) => ({
    startsAt: new Date(slot.start).toISOString(),
    endsAt: new Date(slot.end).toISOString(),
    label: slot.label,
    outOfHours: slot.outOfHours,
    cells: courts.map((court) =>
      stateFor(blocks, court.id, slot.start, slot.end, !slot.outOfHours),
    ),
  }));

  return {
    date,
    timezone,
    openTime: open,
    closeTime: close,
    slotMinutes: settings.slotMinutes,
    closed: isClosed,
    courts,
    rows,
  };
}

/**
 * Widen a closed day's span at both ends until it covers every block on the
 * date, in whole slots so the rows stay on the same lattice the span starts on.
 * Clamped to the day, because a block that runs over midnight is already shown
 * on the day it starts.
 */
function widenToBlocks(
  span: { open: string; close: string },
  blocks: ScheduleBlock[],
  date: string,
  timezone: string,
  slotMinutes: number,
): { open: string; close: string } {
  if (blocks.length === 0) return span;

  const dayStart = zonedTimeToUtc(date, "00:00", timezone).getTime();
  const dayEnd = zonedTimeToUtc(addDays(date, 1), "00:00", timezone).getTime();
  let openMinutes = timeToMinutes(span.open);
  let closeMinutes = timeToMinutes(span.close);

  for (const block of blocks) {
    const start = Math.max(Date.parse(block.startsAt), dayStart);
    const end = Math.min(Date.parse(block.endsAt), dayEnd);
    const startMinutes = Math.round((start - dayStart) / 60_000);
    const endMinutes = Math.round((end - dayStart) / 60_000);
    if (startMinutes < openMinutes) {
      openMinutes -= Math.ceil((openMinutes - startMinutes) / slotMinutes) * slotMinutes;
    }
    if (endMinutes > closeMinutes) {
      closeMinutes += Math.ceil((endMinutes - closeMinutes) / slotMinutes) * slotMinutes;
    }
  }

  return {
    open: minutesToTime(Math.max(openMinutes, 0)),
    close: closeLabel(Math.min(closeMinutes, 1440)),
  };
}
