"use server";

import {
  describeDatabaseError,
  fail,
  ok,
  parseInput,
  requireStaff,
  type ActionResult,
} from "@/lib/actions";
import type { Database } from "@/lib/supabase/database.types";
import { calendarDateInZone, daysBetween, todayInZone, zonedTimeToUtc } from "@/lib/time";

import { getStaffSchedule, type StaffSchedule } from "./queries";
import {
  cancelReservationSchema,
  createReservationSchema,
  createReservationsSchema,
  retireCourtSchema,
  saveCourtSchema,
  saveVenueSettingsSchema,
  scheduleDateSchema,
  updateReservationSchema,
} from "./schemas";

/**
 * Every write for spec 0002.
 *
 * The order never varies: `requireStaff()` first, then Zod, then a write that
 * is conditional on the version the caller last read. None of that replaces the
 * row level security policies, which are still the enforcement point. It exists
 * so a signed out caller or a stale form gets a clear typed answer rather than
 * an opaque policy denial.
 */

type CourtRow = Database["public"]["Tables"]["court"]["Row"];
type ReservationRow = Database["public"]["Tables"]["reservation"]["Row"];
type VenueSettingsRow = Database["public"]["Tables"]["venue_settings"]["Row"];

type StaffClient =
  Awaited<ReturnType<typeof requireStaff>> extends infer R
    ? R extends { ok: true; supabase: infer S }
      ? S
      : never
    : never;

/** The timezone, slot length and booking window every write is measured against. */
async function loadSettings(supabase: StaffClient) {
  const { data, error } = await supabase
    .from("venue_settings")
    .select("timezone, booking_horizon_days, version")
    .maybeSingle();
  if (error) return { ok: false as const, error: describeDatabaseError(error) };
  if (!data) {
    return {
      ok: false as const,
      error: { kind: "failed" as const, message: "The venue settings row is missing." },
    };
  }
  return { ok: true as const, settings: data };
}

/**
 * A zero row write means either somebody else got there first or a policy
 * refused it, and the caller deserves to know which. Refetch and answer with
 * the fresh row so the screen corrects itself before the person tries again.
 */
async function explainZeroRows(
  supabase: StaffClient,
  table: "reservation" | "court" | "venue_settings",
  match: Record<string, unknown>,
  expectedVersion: number,
) {
  const { data } = await supabase
    .from(table)
    .select("version")
    .match(match)
    .maybeSingle<{ version: number }>();

  if (!data) {
    return { kind: "not_found" as const, message: "That row is gone." };
  }
  if (data.version !== expectedVersion) {
    return {
      kind: "conflict" as const,
      reason: "version_stale" as const,
      message: `Somebody else changed this first. It is now at version ${data.version}.`,
    };
  }
  // The row is still at the version the caller sent, so nothing raced them.
  // A policy turned the write away.
  return {
    kind: "forbidden" as const,
    message: "Your account is not allowed to make that change.",
  };
}

/** Booking times arrive as a venue local date plus `HH:mm`, never as an instant. */
function toInstants(
  date: string,
  startTime: string,
  endTime: string,
  timezone: string,
): { startsAt: string; endsAt: string } {
  return {
    startsAt: zonedTimeToUtc(date, startTime, timezone).toISOString(),
    endsAt: zonedTimeToUtc(date, endTime, timezone).toISOString(),
  };
}

/** The far edge of the booking window, from the settings row. */
function checkHorizon(date: string, timezone: string, horizonDays: number) {
  const today = todayInZone(timezone);
  if (daysBetween(today, date) > horizonDays) {
    return {
      kind: "invalid" as const,
      message: `Bookings only open ${horizonDays} days ahead.`,
      issues: { date: [`Bookings only open ${horizonDays} days ahead.`] },
    };
  }
  return null;
}

/** AC-6 in friendlier words, and the booking window from the settings row. */
function checkBookingWindow(date: string, timezone: string, horizonDays: number) {
  const today = todayInZone(timezone);
  if (daysBetween(today, date) < 0) {
    return {
      kind: "forbidden" as const,
      message: "Only an owner may change a booking in the past.",
    };
  }
  return checkHorizon(date, timezone, horizonDays);
}

/**
 * The day as the desk sees it, callable from the browser. Spec 0005, AC-10.
 *
 * The staff board refetches the whole day after every write and on every
 * broadcast rather than patching cells from a payload. `getStaffSchedule`
 * already runs `requireStaff()` and checks the date, so this wrapper only
 * exists to put it behind the Server Action boundary.
 */
export async function refreshStaffSchedule(input: unknown): Promise<ActionResult<StaffSchedule>> {
  const parsed = parseInput(scheduleDateSchema, input);
  if (!parsed.ok) return fail(parsed.error);
  return getStaffSchedule(parsed.data.date);
}

export async function createReservation(input: unknown): Promise<ActionResult<ReservationRow>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(createReservationSchema, input);
  if (!parsed.ok) return fail(parsed.error);

  const loaded = await loadSettings(staff.supabase);
  if (!loaded.ok) return fail(loaded.error);

  const windowError = checkBookingWindow(
    parsed.data.date,
    loaded.settings.timezone,
    loaded.settings.booking_horizon_days,
  );
  if (windowError) return fail(windowError);

  const { startsAt, endsAt } = toInstants(
    parsed.data.date,
    parsed.data.startTime,
    parsed.data.endTime,
    loaded.settings.timezone,
  );

  const { data, error } = await staff.supabase
    .from("reservation")
    .insert({
      court_id: parsed.data.courtId,
      kind: parsed.data.kind,
      starts_at: startsAt,
      ends_at: endsAt,
      customer_name: parsed.data.customerName ?? null,
      customer_phone: parsed.data.customerPhone ?? null,
      note: parsed.data.note ?? null,
      payment_status: parsed.data.paymentStatus ?? "unpaid",
      amount: parsed.data.amount ?? null,
      created_by: staff.staffId,
      changed_by: staff.staffId,
    })
    .select()
    .single();

  // The exclusion constraint refusing an overlap lands here, and only here.
  if (error) return fail(describeDatabaseError(error));
  return ok(data);
}

/**
 * A whole selection in one statement. Spec 0005, AC-4, AC-5 and AC-6.
 *
 * supabase-js sends an array insert as one statement, and Postgres applies the
 * exclusion constraint to the statement as a whole, so a clash on any run rolls
 * back every run: the set lands or it does not, never half of it. Whether a run
 * that has already ended may be written is left to the insert policy, which
 * lets an owner through and refuses staff with a `forbidden` result (AC-11).
 */
export async function createReservations(input: unknown): Promise<ActionResult<ReservationRow[]>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(createReservationsSchema, input);
  if (!parsed.ok) return fail(parsed.error);

  const loaded = await loadSettings(staff.supabase);
  if (!loaded.ok) return fail(loaded.error);

  for (const run of parsed.data.runs) {
    const horizonError = checkHorizon(
      run.date,
      loaded.settings.timezone,
      loaded.settings.booking_horizon_days,
    );
    if (horizonError) return fail(horizonError);
  }

  const shared = {
    kind: parsed.data.kind,
    customer_name: parsed.data.customerName ?? null,
    customer_phone: parsed.data.customerPhone ?? null,
    note: parsed.data.note ?? null,
    payment_status: parsed.data.paymentStatus ?? "unpaid",
    amount: parsed.data.amount ?? null,
    created_by: staff.staffId,
    changed_by: staff.staffId,
  };

  const rows = parsed.data.runs.map((run) => {
    const { startsAt, endsAt } = toInstants(
      run.date,
      run.startTime,
      run.endTime,
      loaded.settings.timezone,
    );
    return { ...shared, court_id: run.courtId, starts_at: startsAt, ends_at: endsAt };
  });

  const { data, error } = await staff.supabase.from("reservation").insert(rows).select();

  // One statement, so `23P01` here means the whole set was refused.
  if (error) return fail(describeDatabaseError(error));
  return ok(data);
}

export async function updateReservation(input: unknown): Promise<ActionResult<ReservationRow>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(updateReservationSchema, input);
  if (!parsed.ok) return fail(parsed.error);

  const loaded = await loadSettings(staff.supabase);
  if (!loaded.ok) return fail(loaded.error);

  const patch: Database["public"]["Tables"]["reservation"]["Update"] = {
    version: parsed.data.version + 1,
    changed_by: staff.staffId,
  };

  if (parsed.data.courtId !== undefined) patch.court_id = parsed.data.courtId;
  if (parsed.data.kind !== undefined) patch.kind = parsed.data.kind;
  if (parsed.data.customerName !== undefined) patch.customer_name = parsed.data.customerName;
  if (parsed.data.customerPhone !== undefined) {
    patch.customer_phone = parsed.data.customerPhone ?? null;
  }
  if (parsed.data.note !== undefined) patch.note = parsed.data.note ?? null;
  if (parsed.data.paymentStatus !== undefined) patch.payment_status = parsed.data.paymentStatus;
  if (parsed.data.amount !== undefined) patch.amount = parsed.data.amount ?? null;

  // The schema already insists the three range fields move together, so a
  // partial range can never reach here.
  if (parsed.data.date && parsed.data.startTime && parsed.data.endTime) {
    const windowError = checkBookingWindow(
      parsed.data.date,
      loaded.settings.timezone,
      loaded.settings.booking_horizon_days,
    );
    // A move into the past is refused here for a clearer message, and refused
    // again by the `with check` half of the update policy regardless.
    if (windowError) return fail(windowError);

    const { startsAt, endsAt } = toInstants(
      parsed.data.date,
      parsed.data.startTime,
      parsed.data.endTime,
      loaded.settings.timezone,
    );
    patch.starts_at = startsAt;
    patch.ends_at = endsAt;
  } else if (parsed.data.endTime) {
    // Spec 0005, AC-8: a closure edit moves only its end. The date comes from
    // the stored start, read back to a venue local day, so the client never
    // gets to say which day the row is on.
    const { data: stored, error: storedError } = await staff.supabase
      .from("reservation")
      .select("starts_at")
      .eq("id", parsed.data.id)
      .maybeSingle();
    if (storedError) return fail(describeDatabaseError(storedError));
    if (!stored) return fail({ kind: "not_found", message: "That row is gone." });

    const date = calendarDateInZone(new Date(stored.starts_at), loaded.settings.timezone);
    const endsAt = zonedTimeToUtc(date, parsed.data.endTime, loaded.settings.timezone);
    if (endsAt.getTime() <= Date.parse(stored.starts_at)) {
      const message = "The end time has to be after the start time.";
      return fail({ kind: "invalid", message, issues: { endTime: [message] } });
    }
    patch.ends_at = endsAt.toISOString();
  }

  const { data, error } = await staff.supabase
    .from("reservation")
    .update(patch)
    .eq("id", parsed.data.id)
    .eq("version", parsed.data.version)
    .select()
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) {
    return fail(
      await explainZeroRows(
        staff.supabase,
        "reservation",
        { id: parsed.data.id },
        parsed.data.version,
      ),
    );
  }
  return ok(data);
}

export async function cancelReservation(input: unknown): Promise<ActionResult<ReservationRow>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(cancelReservationSchema, input);
  if (!parsed.ok) return fail(parsed.error);

  // `cancelled` is terminal, and it drops the row out of the exclusion
  // constraint, so the slot is bookable again the moment this lands.
  const { data, error } = await staff.supabase
    .from("reservation")
    .update({
      status: "cancelled",
      version: parsed.data.version + 1,
      changed_by: staff.staffId,
    })
    .eq("id", parsed.data.id)
    .eq("version", parsed.data.version)
    .eq("status", "active")
    .select()
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) {
    return fail(
      await explainZeroRows(
        staff.supabase,
        "reservation",
        { id: parsed.data.id },
        parsed.data.version,
      ),
    );
  }
  return ok(data);
}

export async function saveCourt(input: unknown): Promise<ActionResult<CourtRow>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(saveCourtSchema, input);
  if (!parsed.ok) return fail(parsed.error);

  const { id, version, name, note, restore } = parsed.data;
  let sortOrder = parsed.data.sortOrder;

  if (id === undefined) {
    const { data, error } = await staff.supabase
      .from("court")
      .insert({ name, sort_order: sortOrder, note: note ?? null, changed_by: staff.staffId })
      .select()
      .single();
    if (error) return fail(describeDatabaseError(error));
    return ok(data);
  }

  if (version === undefined) {
    const message = "Editing a court needs the version you last read.";
    return fail({ kind: "invalid", message, issues: { version: [message] } });
  }

  const patch: Database["public"]["Tables"]["court"]["Update"] = {
    name,
    note: note ?? null,
    version: version + 1,
    changed_by: staff.staffId,
  };

  if (restore) {
    // Bringing a court back is not the moment to argue about its old position:
    // the collision is an artifact of the partial unique index, so take the
    // next free order instead of refusing.
    patch.retired_at = null;
    const { data: taken } = await staff.supabase
      .from("court")
      .select("sort_order")
      .is("retired_at", null)
      .neq("id", id);
    const used = new Set((taken ?? []).map((row) => row.sort_order));
    if (used.has(sortOrder)) {
      sortOrder = Math.max(0, ...used) + 1;
    }
  }
  patch.sort_order = sortOrder;

  const { data, error } = await staff.supabase
    .from("court")
    .update(patch)
    .eq("id", id)
    .eq("version", version)
    .select()
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) {
    return fail(await explainZeroRows(staff.supabase, "court", { id }, version));
  }
  return ok(data);
}

export async function retireCourt(input: unknown): Promise<ActionResult<CourtRow>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(retireCourtSchema, input);
  if (!parsed.ok) return fail(parsed.error);

  // Only bookings block a retirement. A closure is not somebody who will turn
  // up at the desk, so it does not count.
  const { count, error: countError } = await staff.supabase
    .from("reservation")
    .select("id", { count: "exact", head: true })
    .eq("court_id", parsed.data.id)
    .eq("kind", "booking")
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString());

  if (countError) return fail(describeDatabaseError(countError));
  if (count && count > 0) {
    return fail({
      kind: "conflict",
      reason: "court_has_bookings",
      count,
      message: `That court still has ${count} booking${count === 1 ? "" : "s"} ahead of it.`,
    });
  }

  const { data, error } = await staff.supabase
    .from("court")
    .update({
      retired_at: new Date().toISOString(),
      version: parsed.data.version + 1,
      changed_by: staff.staffId,
    })
    .eq("id", parsed.data.id)
    .eq("version", parsed.data.version)
    .select()
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) {
    return fail(
      await explainZeroRows(staff.supabase, "court", { id: parsed.data.id }, parsed.data.version),
    );
  }
  return ok(data);
}

export async function saveVenueSettings(input: unknown): Promise<ActionResult<VenueSettingsRow>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(saveVenueSettingsSchema, input);
  if (!parsed.ok) return fail(parsed.error);

  const { data, error } = await staff.supabase
    .from("venue_settings")
    .update({
      weekday_open: parsed.data.weekdayOpen,
      weekday_close: parsed.data.weekdayClose,
      weekend_open: parsed.data.weekendOpen,
      weekend_close: parsed.data.weekendClose,
      slot_minutes: parsed.data.slotMinutes,
      booking_horizon_days: parsed.data.bookingHorizonDays,
      version: parsed.data.version + 1,
      changed_by: staff.staffId,
    })
    .eq("id", true)
    .eq("version", parsed.data.version)
    .select()
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) {
    return fail(
      await explainZeroRows(staff.supabase, "venue_settings", { id: true }, parsed.data.version),
    );
  }
  return ok(data);
}
