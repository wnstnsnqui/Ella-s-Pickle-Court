import "server-only";

import { cache } from "react";

import {
  describeDatabaseError,
  fail,
  ok,
  requireStaff,
  type ActionResult,
  type InvalidReason,
} from "@/lib/actions";
import { reportFailure } from "@/lib/analytics/server";
import { publicSupabase } from "@/lib/supabase/public";
import type { Database } from "@/lib/supabase/database.types";
import { addDays, daysBetween, todayInZone, trimSeconds } from "@/lib/time";

import {
  buildGrid,
  dayBoundsUtc,
  type Grid,
  type GridCourt,
  type ScheduleBlock,
  type VenueSettings,
} from "./grid";
import type { PaymentStatus, ReservationKind, ReservationStatus } from "./constants";
import { calendarDateSchema } from "./schemas";

/**
 * The read paths for spec 0002, plus the owner's settings read for spec 0007.
 *
 * `getSchedule` is the public grid: anon key, no Clerk token, and it names the
 * four columns anon is granted on `reservation`. It cannot ask for a customer's
 * name even by accident, because Postgres would refuse the column (AC-4).
 *
 * `getStaffSchedule` is the same day read with the signed in staff member's
 * token, which is the only way the desk sees who a booking is for.
 *
 * `getOwnerSettings` is what the settings page reads: every court, live and
 * retired, and the settings row, each with its version.
 */

type VenueSettingsRow = Database["public"]["Tables"]["venue_settings"]["Row"];
type CourtRow = Database["public"]["Tables"]["court"]["Row"];

export type Schedule = {
  grid: Grid;
  settingsVersion: number;
  /** How far ahead the day navigation may go, from `venue_settings`. */
  horizonDays: number;
  /**
   * The server's clock at the read, a UTC instant (spec 0006, AC-4). Every
   * "now" a board shows starts from this stamp and only ever adds elapsed time,
   * so a device with a wrong clock cannot move the marker or the strip.
   */
  now: string;
  /** The venue's opening hours, venue local `HH:mm`, for the JSON-LD block (spec 0006, AC-11). */
  hours: VenueHours;
};

export type VenueHours = {
  weekdayOpen: string;
  weekdayClose: string;
  weekendOpen: string;
  weekendClose: string;
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
  createdAt: string;
  updatedAt: string;
};

/** A name for every Clerk id that ever wrote a row, active or not. Spec 0005, AC-7. */
export type StaffName = {
  clerkUserId: string;
  displayName: string;
};

export type StaffSchedule = Schedule & {
  reservations: StaffReservation[];
  staff: StaffName[];
};

/** A court as the settings page holds it: identity, order, and the version every write carries. */
export type OwnerCourt = {
  id: number;
  name: string;
  note: string | null;
  sortOrder: number;
  /** A UTC instant when the court is retired, null while it is live. */
  retiredAt: string | null;
  version: number;
};

export type OwnerSettings = {
  /** Every court, live and retired, in `sort_order`. */
  courts: OwnerCourt[];
  settings: VenueSettings;
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
async function loadSettings(supabase: ReturnType<typeof publicSupabase>, distinctId?: string) {
  const { data, error } = await supabase
    .from("venue_settings")
    .select(
      "weekday_open, weekday_close, weekend_open, weekend_close, slot_minutes, booking_horizon_days, timezone, version",
    )
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      error: describeDatabaseError(error, { action: "loadSettings", distinctId }),
    };
  }
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
 *
 * `allowPast` is the one difference between the two read paths (spec 0006):
 * the public board shows today onward, because yesterday is history and belongs
 * to Ella's reporting, while the staff read keeps the past so an owner can look back.
 */
function resolveDate(
  date: string | undefined,
  timezone: string,
  horizonDays: number,
  now: Date,
  allowPast: boolean,
): { ok: true; date: string } | { ok: false; error: ReturnType<typeof failInvalidDate> } {
  const today = todayInZone(timezone, now);
  if (date === undefined) return { ok: true, date: today };

  const parsed = calendarDateSchema.safeParse(date);
  if (!parsed.success) return { ok: false, error: failInvalidDate("Use a date like 2026-09-05.") };

  if (!allowPast && daysBetween(today, parsed.data) < 0) {
    return {
      ok: false,
      error: failInvalidDate("That day has passed. The board shows today onward."),
    };
  }

  if (daysBetween(today, parsed.data) > horizonDays) {
    // Tagged, so a board showing this day when the horizon shrinks can go back
    // to today rather than showing an error (spec 0007, AC-12).
    return {
      ok: false,
      error: failInvalidDate(
        `The schedule only goes as far as ${addDays(today, horizonDays)} for now.`,
        "out_of_range",
      ),
    };
  }
  return { ok: true, date: parsed.data };
}

function failInvalidDate(message: string, reason?: InvalidReason) {
  return { kind: "invalid" as const, message, issues: { date: [message] }, reason };
}

function toHours(settings: ReturnType<typeof toSettings>): VenueHours {
  return {
    weekdayOpen: settings.weekdayOpen,
    weekdayClose: settings.weekdayClose,
    weekendOpen: settings.weekendOpen,
    weekendClose: settings.weekendClose,
  };
}

/**
 * The public grid. Anonymous, read only, and every column it asks for is one
 * anon holds a grant on.
 *
 * Wrapped in React's per request `cache()` so `generateMetadata` and the page
 * body share one database round trip (spec 0006, AC-11): the same arguments in
 * the same request return the same promise.
 */
export const getSchedule = cache(async (date?: string): Promise<ActionResult<Schedule>> => {
  const supabase = publicSupabase();
  const now = new Date();

  const loaded = await loadSettings(supabase);
  if (!loaded.ok) return fail(loaded.error);
  const settings = loaded.settings;

  const resolved = resolveDate(date, settings.timezone, settings.bookingHorizonDays, now, false);
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

  if (courts.error) {
    reportFailure(courts.error, { action: "getSchedule" });
    return fail({ kind: "failed", message: courts.error.message });
  }
  if (blocks.error) {
    reportFailure(blocks.error, { action: "getSchedule" });
    return fail({ kind: "failed", message: blocks.error.message });
  }

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

  return ok({
    grid,
    settingsVersion: settings.version,
    horizonDays: settings.bookingHorizonDays,
    now: now.toISOString(),
    hours: toHours(settings),
  });
});

/**
 * The same day as the desk sees it: the grid plus every reservation column,
 * read with the staff member's own token so the policies decide what comes back.
 */
export async function getStaffSchedule(date?: string): Promise<ActionResult<StaffSchedule>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const supabase = staff.supabase;
  const now = new Date();

  const loaded = await loadSettings(supabase, staff.staffId);
  if (!loaded.ok) return fail(loaded.error);
  const settings = loaded.settings;

  const resolved = resolveDate(date, settings.timezone, settings.bookingHorizonDays, now, true);
  if (!resolved.ok) return fail(resolved.error);

  const bounds = dayBoundsUtc(resolved.date, settings.timezone);

  const [courts, reservations, staffRows] = await Promise.all([
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
    // The whole table, no `is_active` filter, so a leaver's name still resolves
    // on the bookings they made (spec 0005, AC-7).
    supabase.from("staff").select("clerk_user_id, display_name"),
  ]);

  if (courts.error) {
    reportFailure(courts.error, { action: "getStaffSchedule", distinctId: staff.staffId });
    return fail({ kind: "failed", message: courts.error.message });
  }
  if (reservations.error) {
    reportFailure(reservations.error, { action: "getStaffSchedule", distinctId: staff.staffId });
    return fail({ kind: "failed", message: reservations.error.message });
  }
  if (staffRows.error) {
    reportFailure(staffRows.error, { action: "getStaffSchedule", distinctId: staff.staffId });
    return fail({ kind: "failed", message: staffRows.error.message });
  }

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
    horizonDays: settings.bookingHorizonDays,
    now: now.toISOString(),
    hours: toHours(settings),
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    staff: (staffRows.data ?? []).map((row) => ({
      clerkUserId: row.clerk_user_id,
      displayName: row.display_name,
    })),
  });
}

/**
 * What the owner's settings page reads. Spec 0007, AC-2.
 *
 * A plain read on the staff client, not a widening of the schedule read: the
 * page needs retired courts, which no board wants. The policies decide what
 * comes back, and a non owner reaches this only through the page, which has
 * already sent them to `/staff`.
 */
export async function getOwnerSettings(): Promise<ActionResult<OwnerSettings>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const supabase = staff.supabase;

  const [loaded, courts] = await Promise.all([
    loadSettings(supabase, staff.staffId),
    supabase
      .from("court")
      .select("id, name, note, sort_order, retired_at, version")
      .order("sort_order")
      .order("id"),
  ]);

  if (!loaded.ok) return fail(loaded.error);
  if (courts.error) {
    reportFailure(courts.error, { action: "getOwnerSettings", distinctId: staff.staffId });
    return fail({ kind: "failed", message: courts.error.message });
  }

  return ok({
    courts: (courts.data ?? []).map((row): OwnerCourt => ({
      id: row.id,
      name: row.name,
      note: row.note,
      sortOrder: row.sort_order,
      retiredAt: row.retired_at,
      version: row.version,
    })),
    settings: loaded.settings,
  });
}
