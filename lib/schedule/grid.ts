import {
  addDays,
  isWeekend,
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

export type VenueSettings = {
  weekdayOpen: string;
  weekdayClose: string;
  weekendOpen: string;
  weekendClose: string;
  slotMinutes: number;
  bookingHorizonDays: number;
  timezone: string;
  version: number;
};

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

/** Which pair of opening hours applies, chosen by the weekday at the venue. */
export function openingHours(
  date: string,
  settings: VenueSettings,
): { open: string; close: string } {
  return isWeekend(date)
    ? { open: trimSeconds(settings.weekendOpen), close: trimSeconds(settings.weekendClose) }
    : { open: trimSeconds(settings.weekdayOpen), close: trimSeconds(settings.weekdayClose) };
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
 */
export function buildGrid(input: {
  date: string;
  settings: VenueSettings;
  courts: GridCourt[];
  blocks: ScheduleBlock[];
}): Grid {
  const { date, settings, blocks } = input;
  const courts = [...input.courts].sort((a, b) => a.sortOrder - b.sortOrder);
  const { open, close } = openingHours(date, settings);
  const timezone = settings.timezone;

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
    inHoursRanges.push({ start, end, label, outOfHours: false });
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
    courts,
    rows,
  };
}
