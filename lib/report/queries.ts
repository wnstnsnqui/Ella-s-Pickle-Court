import "server-only";

import { fail, ok, requireStaff, type ActionResult } from "@/lib/actions";
import type { Database } from "@/lib/supabase/database.types";
import {
  calendarDateInZone,
  localEndTimeInZone,
  localTimeInZone,
  todayInZone,
  trimSeconds,
} from "@/lib/time";
import { VENUE_TIMEZONE } from "@/lib/env";

import type { ReportHours } from "./buckets";
import { resolveRange, type ReportRangePreset } from "./range";

/**
 * The two reads for spec 0008: the usage rows behind the charts and CSV, and
 * one day's bookings for the day list. Both run on `staffSupabase()`, so the
 * database's own owner check on `court_usage` is what actually enforces
 * AC-4; the page and the CSV route's redirects and status codes are
 * courtesies on top.
 */

export type UsageRow = { courtId: number; localDate: string; hour: number; bookedMinutes: number };

export type ReportCourt = {
  id: number;
  name: string;
  sortOrder: number;
  retiredAt: string | null;
};

export type UsageReport = {
  from: string;
  to: string;
  rows: UsageRow[];
  courts: ReportCourt[];
  hours: ReportHours;
};

function describeReportError(error: { code?: string; message: string }) {
  if (error.code === "42501") {
    return {
      kind: "forbidden" as const,
      message: "Your account is not allowed to read this report.",
    };
  }
  return { kind: "failed" as const, message: error.message };
}

export async function getUsageReport({
  range,
  courtId,
}: {
  range: ReportRangePreset;
  courtId?: number;
}): Promise<ActionResult<UsageReport>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const today = todayInZone(VENUE_TIMEZONE);
  const { from, to } = resolveRange(range, today);

  const [usage, courts, settings] = await Promise.all([
    staff.supabase.rpc("court_usage", {
      from_date: from,
      to_date: to,
      for_court_id: courtId ?? undefined,
    }),
    staff.supabase
      .from("court")
      .select("id, name, sort_order, retired_at")
      .order("sort_order")
      .order("id"),
    staff.supabase
      .from("venue_settings")
      .select("weekday_open, weekday_close, weekend_open, weekend_close")
      .maybeSingle(),
  ]);

  if (usage.error) return fail(describeReportError(usage.error));
  if (courts.error) return fail({ kind: "failed", message: courts.error.message });
  if (settings.error) return fail({ kind: "failed", message: settings.error.message });
  if (!settings.data) {
    return fail({ kind: "failed", message: "The venue settings row is missing." });
  }

  return ok({
    from,
    to,
    rows: (usage.data ?? []).map((row): UsageRow => ({
      courtId: row.court_id,
      localDate: row.local_date,
      hour: row.hour,
      bookedMinutes: row.booked_minutes,
    })),
    courts: (courts.data ?? []).map((row): ReportCourt => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sort_order,
      retiredAt: row.retired_at,
    })),
    hours: {
      weekdayOpen: trimSeconds(settings.data.weekday_open),
      weekdayClose: trimSeconds(settings.data.weekday_close),
      weekendOpen: trimSeconds(settings.data.weekend_open),
      weekendClose: trimSeconds(settings.data.weekend_close),
    },
  });
}

export type DayReservation = {
  id: number;
  courtId: number;
  courtName: string;
  kind: Database["public"]["Tables"]["reservation"]["Row"]["kind"];
  status: Database["public"]["Tables"]["reservation"]["Row"]["status"];
  startTime: string;
  endTime: string;
  customerName: string | null;
  note: string | null;
  createdByName: string | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
};

/**
 * Every reservation touching one local day, active and cancelled, bookings
 * and closures. Spec 0008, AC-8. `day` is trusted to already be inside the
 * resolved range; the page is what enforces that.
 */
export async function getDayReservations(day: string): Promise<ActionResult<DayReservation[]>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const [courts, staffRows, reservations] = await Promise.all([
    staff.supabase.from("court").select("id, name, sort_order"),
    staff.supabase.from("staff").select("user_id, display_name"),
    staff.supabase
      .from("reservation")
      .select(
        "id, court_id, kind, status, starts_at, ends_at, customer_name, note, created_by, cancelled_by, cancelled_at",
      )
      .lt("starts_at", `${day}T23:59:59.999Z`)
      .gt("ends_at", `${day}T00:00:00.000Z`),
  ]);

  if (courts.error) return fail({ kind: "failed", message: courts.error.message });
  if (staffRows.error) return fail({ kind: "failed", message: staffRows.error.message });
  if (reservations.error) return fail({ kind: "failed", message: reservations.error.message });

  const courtById = new Map((courts.data ?? []).map((court) => [court.id, court]));
  const nameByStaffId = new Map(
    (staffRows.data ?? []).map((row) => [row.user_id, row.display_name]),
  );

  // The naive UTC window above is wide on purpose (it may pull in a
  // neighbouring day at the venue's offset); narrow to rows that actually
  // touch the venue local day before sorting and returning them.
  const rows = (reservations.data ?? []).filter((row) => {
    const startDate = calendarDateInZone(new Date(row.starts_at), VENUE_TIMEZONE);
    const endDate = calendarDateInZone(new Date(row.ends_at), VENUE_TIMEZONE);
    return startDate === day || endDate === day || (startDate < day && endDate > day);
  });

  const sorted = rows
    .map((row) => ({
      row,
      sortOrder: courtById.get(row.court_id)?.sort_order ?? 0,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.row.starts_at.localeCompare(b.row.starts_at));

  return ok(
    sorted.map(({ row }): DayReservation => ({
      id: row.id,
      courtId: row.court_id,
      courtName: courtById.get(row.court_id)?.name ?? "Unknown court",
      kind: row.kind,
      status: row.status,
      startTime: localTimeInZone(row.starts_at, VENUE_TIMEZONE),
      endTime: localEndTimeInZone(row.ends_at, VENUE_TIMEZONE),
      customerName: row.customer_name,
      note: row.note,
      createdByName: row.created_by ? (nameByStaffId.get(row.created_by) ?? null) : null,
      cancelledByName: row.cancelled_by ? (nameByStaffId.get(row.cancelled_by) ?? null) : null,
      cancelledAt: row.cancelled_at,
    })),
  );
}
