import "server-only";

import { fail, ok, requireStaff, type ActionResult } from "@/lib/actions";
import { publicSupabase } from "@/lib/supabase/public";
import type { Database } from "@/lib/supabase/database.types";
import { addDays, daysBetween, todayInZone, trimSeconds } from "@/lib/time";

import { buildGrid, dayBoundsUtc, type Grid, type GridCourt, type ScheduleBlock } from "./grid";
import type { PaymentStatus, ReservationKind, ReservationStatus } from "./constants";
import { calendarDateSchema } from "./schemas";

/**
 * The two read paths for spec 0002.
 *
 * `getSchedule` is the public grid: anon key, no Clerk token, and it names the
 * four columns anon is granted on `reservation`. It cannot ask for a customer's
 * name even by accident, because Postgres would refuse the column (AC-4).
 *
 * `getStaffSchedule` is the same day read with the signed in staff member's
 * token, which is the only way the desk sees who a booking is for.
 */

type VenueSettingsRow = Database["public"]["Tables"]["venue_settings"]["Row"];
type CourtRow = Database["public"]["Tables"]["court"]["Row"];

export type Schedule = {
  grid: Grid;
  settingsVersion: number;
};

/** Every column of a reservation, which only the staff path ever sees. */
export type StaffReservation = {
  id: number;
  courtId: number;
  kind: ReservationKind;
  status: ReservationStatus;
  startsAt: string;
  endsAt: string;
  customerName: string | null;
  customerPhone: string | null;
  note: string | null;
  paymentStatus: PaymentStatus;
  amount: number | null;
  version: number;
  createdBy: string | null;
  changedBy: string | null;
};

export type StaffSchedule = Schedule & {
  reservations: StaffReservation[];
};

function toSettings(row: VenueSettingsRow) {
  return {
    weekdayOpen: trimSeconds(row.weekday_open),
    weekdayClose: trimSeconds(row.weekday_close),
    weekendOpen: trimSeconds(row.weekend_open),
    weekendClose: trimSeconds(row.weekend_close),
    slotMinutes: row.slot_minutes,
    bookingHorizonDays: row.booking_horizon_days,
    timezone: row.timezone,
    version: row.version,
  };
}

function toCourt(row: Pick<CourtRow, "id" | "name" | "note" | "sort_order">): GridCourt {
  return { id: row.id, name: row.name, note: row.note, sortOrder: row.sort_order };
}

/**
 * Read the settings row first, because the date, the weekday, the opening
 * hours and the day's UTC bounds all depend on the timezone stored there
 * rather than on wherever this server happens to be running.
 */
async function loadSettings(supabase: ReturnType<typeof publicSupabase>) {
  const { data, error } = await supabase
    .from("venue_settings")
    .select(
      "weekday_open, weekday_close, weekend_open, weekend_close, slot_minutes, booking_horizon_days, timezone, version",
    )
    .maybeSingle();

  if (error)
    return { ok: false as const, error: { kind: "failed" as const, message: error.message } };
  if (!data) {
    return {
      ok: false as const,
      error: { kind: "failed" as const, message: "The venue settings row is missing." },
    };
  }
  return { ok: true as const, settings: toSettings(data as VenueSettingsRow) };
}

/**
 * Resolve the day being shown. An absent date means today at the venue, never
 * today wherever the reader is standing.
 */
function resolveDate(
  date: string | undefined,
  timezone: string,
  horizonDays: number,
): { ok: true; date: string } | { ok: false; error: ReturnType<typeof failInvalidDate> } {
  const today = todayInZone(timezone);
  if (date === undefined) return { ok: true, date: today };

  const parsed = calendarDateSchema.safeParse(date);
  if (!parsed.success) return { ok: false, error: failInvalidDate("Use a date like 2026-09-05.") };

  if (daysBetween(today, parsed.data) > horizonDays) {
    return {
      ok: false,
      error: failInvalidDate(
        `The schedule only goes as far as ${addDays(today, horizonDays)} for now.`,
      ),
    };
  }
  return { ok: true, date: parsed.data };
}

function failInvalidDate(message: string) {
  return { kind: "invalid" as const, message, issues: { date: [message] } };
}

/**
 * The public grid. Anonymous, read only, and every column it asks for is one
 * anon holds a grant on.
 */
export async function getSchedule(date?: string): Promise<ActionResult<Schedule>> {
  const supabase = publicSupabase();

  const loaded = await loadSettings(supabase);
  if (!loaded.ok) return fail(loaded.error);
  const settings = loaded.settings;

  const resolved = resolveDate(date, settings.timezone, settings.bookingHorizonDays);
  if (!resolved.ok) return fail(resolved.error);

  const bounds = dayBoundsUtc(resolved.date, settings.timezone);

  const [courts, blocks] = await Promise.all([
    supabase.from("court").select("id, name, note, sort_order").order("sort_order"),
    // Exactly the four columns granted to anon. Asking for a fifth is refused
    // by Postgres rather than quietly returning too much.
    supabase
      .from("reservation")
      .select("court_id, starts_at, ends_at, kind")
      .lt("starts_at", bounds.end.toISOString())
      .gt("ends_at", bounds.start.toISOString()),
  ]);

  if (courts.error) return fail({ kind: "failed", message: courts.error.message });
  if (blocks.error) return fail({ kind: "failed", message: blocks.error.message });

  const grid = buildGrid({
    date: resolved.date,
    settings,
    courts: (courts.data ?? []).map(toCourt),
    blocks: (blocks.data ?? []).map((row): ScheduleBlock => ({
      courtId: row.court_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      kind: row.kind as ReservationKind,
    })),
  });

  return ok({ grid, settingsVersion: settings.version });
}

/**
 * The same day as the desk sees it: the grid plus every reservation column,
 * read with the staff member's own token so the policies decide what comes back.
 */
export async function getStaffSchedule(date?: string): Promise<ActionResult<StaffSchedule>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const supabase = staff.supabase;

  const loaded = await loadSettings(supabase);
  if (!loaded.ok) return fail(loaded.error);
  const settings = loaded.settings;

  const resolved = resolveDate(date, settings.timezone, settings.bookingHorizonDays);
  if (!resolved.ok) return fail(resolved.error);

  const bounds = dayBoundsUtc(resolved.date, settings.timezone);

  const [courts, reservations] = await Promise.all([
    supabase
      .from("court")
      .select("id, name, note, sort_order")
      .is("retired_at", null)
      .order("sort_order"),
    supabase
      .from("reservation")
      .select("*")
      .lt("starts_at", bounds.end.toISOString())
      .gt("ends_at", bounds.start.toISOString())
      .order("starts_at"),
  ]);

  if (courts.error) return fail({ kind: "failed", message: courts.error.message });
  if (reservations.error) return fail({ kind: "failed", message: reservations.error.message });

  const rows = reservations.data ?? [];

  const grid = buildGrid({
    date: resolved.date,
    settings,
    courts: (courts.data ?? []).map(toCourt),
    // Cancelled rows stay readable for reporting but never occupy a cell.
    blocks: rows
      .filter((row) => row.status === "active")
      .map((row): ScheduleBlock => ({
        courtId: row.court_id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        kind: row.kind as ReservationKind,
      })),
  });

  return ok({
    grid,
    settingsVersion: settings.version,
    reservations: rows.map((row): StaffReservation => ({
      id: row.id,
      courtId: row.court_id,
      kind: row.kind as ReservationKind,
      status: row.status as ReservationStatus,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      note: row.note,
      paymentStatus: row.payment_status as PaymentStatus,
      amount: row.amount,
      version: row.version,
      createdBy: row.created_by,
      changedBy: row.changed_by,
    })),
  });
}
