import type { Grid } from "@/lib/schedule/grid";

/**
 * SAMPLE DATA, for `/design` only.
 *
 * The design page has to show a grid that looks like a real day without touching
 * the database, because it must render for anybody, signed in or not, with no
 * Supabase credentials present. Nothing outside this folder imports it. The real
 * boards (features 6 and 7) read `getSchedule` from `lib/schedule/queries.ts`.
 */
export const SAMPLE_TIMEZONE = "Asia/Manila";
export const SAMPLE_HORIZON_DAYS = 14;

const COURTS = [
  { id: 1, name: "Court 1", note: null, sortOrder: 1 },
  { id: 2, name: "Court 2", note: null, sortOrder: 2 },
  { id: 3, name: "Court 3", note: null, sortOrder: 3 },
];

/** A believable Saturday: a busy morning, a closed court, a quiet afternoon. */
const BOOKED = new Set(["1@06:00", "1@07:00", "2@07:00", "2@08:00", "1@10:00", "3@16:00"]);
const CLOSED = new Set(["3@06:00", "3@07:00", "3@08:00"]);

export function sampleGrid(date: string): Grid {
  const rows = Array.from({ length: 14 }, (_, index) => {
    const hour = 6 + index;
    const label = `${String(hour).padStart(2, "0")}:00`;
    const startsAt = `${date}T${String(hour - 8).padStart(2, "0")}:00:00.000Z`;
    const endsAt = `${date}T${String(hour - 7).padStart(2, "0")}:00:00.000Z`;
    return {
      startsAt,
      endsAt,
      label,
      outOfHours: false,
      cells: COURTS.map((court) => {
        const key = `${court.id}@${label}`;
        const state = CLOSED.has(key) ? "unavailable" : BOOKED.has(key) ? "booked" : "available";
        return {
          courtId: court.id,
          state: state as Grid["rows"][number]["cells"][number]["state"],
          blocks: [],
        };
      }),
    };
  });

  return {
    date,
    timezone: SAMPLE_TIMEZONE,
    openTime: "06:00",
    closeTime: "20:00",
    slotMinutes: 60,
    courts: COURTS,
    rows,
  };
}
