"use server";

import {
  describeDatabaseError,
  fail,
  ok,
  parseInput,
  requireStaff,
  type ActionResult,
} from "@/lib/actions";
import { captureStaffEvent } from "@/lib/analytics/server";
import type { Database } from "@/lib/supabase/database.types";
import { calendarDateInZone, daysBetween, todayInZone, zonedTimeToUtc } from "@/lib/time";

import { countOutsideHours } from "./outside-hours";
import {
  getOwnerSettings,
  getStaffSchedule,
  type OwnerCourt,
  type OwnerSettings,
  type StaffSchedule,
} from "./queries";
import {
  cancelReservationSchema,
  createReservationSchema,
  createReservationsSchema,
  reorderCourtsSchema,
  retireCourtSchema,
  saveCourtSchema,
  saveVenueSettingsSchema,
  scheduleDateSchema,
  updateReservationSchema,
  type SaveVenueSettingsInput,
} from "./schemas";

/**
 * Every write for spec 0002, and the reorder and the settings refetch spec
 * 0007 adds beside them.
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
async function loadSettings(supabase: StaffClient, distinctId: string) {
  const { data, error } = await supabase
    .from("venue_settings")
    .select("timezone, booking_horizon_days, version")
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

type ReservationEventName =
  | "booking_created"
  | "booking_edited"
  | "booking_cancelled"
  | "closure_created"
  | "closure_edited"
  | "closure_cancelled";

/**
 * One `booking_*` or `closure_*` event per written row, fired after the write
 * has already returned its result to the caller (invariant 1: analytics never
 * changes an outcome or its latency). Spec 0009, AC-4.
 *
 * `court_name` is not held by any reservation write today, so it is read back
 * in this background task rather than adding a round trip to the write path
 * itself.
 */
function fireReservationEvent(
  supabase: StaffClient,
  distinctId: string,
  row: ReservationRow,
  action: "created" | "edited" | "cancelled",
  now?: Date,
): void {
  void (async () => {
    const { data: court } = await supabase
      .from("court")
      .select("name")
      .eq("id", row.court_id)
      .maybeSingle();

    const durationMinutes = Math.round(
      (Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60_000,
    );
    const eventName: ReservationEventName =
      row.kind === "booking" ? `booking_${action}` : `closure_${action}`;

    captureStaffEvent(distinctId, eventName, {
      reservation_id: row.id,
      court_id: row.court_id,
      court_name: court?.name ?? "unknown",
      kind: row.kind as "booking" | "closure",
      action,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      duration_minutes: durationMinutes,
      ...(row.kind === "booking" && action === "created" && now
        ? { lead_time_hours: Math.round((Date.parse(row.starts_at) - now.getTime()) / 3_600_000) }
        : {}),
    });
  })();
}

type CourtChangedAction = "created" | "renamed" | "note" | "restored" | "retired" | "reordered";

/** One `court_changed` event. `court_id`/`court_name` are null for a reorder. Spec 0009, AC-4. */
function fireCourtChanged(
  distinctId: string,
  court: { id: number; name: string } | null,
  action: CourtChangedAction,
): void {
  captureStaffEvent(distinctId, "court_changed", {
    court_id: court?.id ?? null,
    court_name: court?.name ?? null,
    action,
  });
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

/**
 * The settings page's own refetch, after a write or a stale version. Spec
 * 0007, AC-13. The page holds no live subscription; this is how it corrects
 * itself. `getOwnerSettings` runs `requireStaff()` itself.
 */
export async function refreshOwnerSettings(): Promise<ActionResult<OwnerSettings>> {
  return getOwnerSettings();
}

export async function createReservation(input: unknown): Promise<ActionResult<ReservationRow>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(createReservationSchema, input);
  if (!parsed.ok) return fail(parsed.error);

  const now = new Date();
  const loaded = await loadSettings(staff.supabase, staff.staffId);
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
  if (error) {
    return fail(
      describeDatabaseError(error, { action: "createReservation", distinctId: staff.staffId }),
    );
  }
  fireReservationEvent(staff.supabase, staff.staffId, data, "created", now);
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

  const now = new Date();
  const loaded = await loadSettings(staff.supabase, staff.staffId);
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
  if (error) {
    return fail(
      describeDatabaseError(error, { action: "createReservations", distinctId: staff.staffId }),
    );
  }
  for (const row of data) fireReservationEvent(staff.supabase, staff.staffId, row, "created", now);
  return ok(data);
}

export async function updateReservation(input: unknown): Promise<ActionResult<ReservationRow>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(updateReservationSchema, input);
  if (!parsed.ok) return fail(parsed.error);

  const loaded = await loadSettings(staff.supabase, staff.staffId);
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
    if (storedError) {
      return fail(
        describeDatabaseError(storedError, {
          action: "updateReservation",
          distinctId: staff.staffId,
        }),
      );
    }
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

  if (error) {
    return fail(
      describeDatabaseError(error, { action: "updateReservation", distinctId: staff.staffId }),
    );
  }
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
  fireReservationEvent(staff.supabase, staff.staffId, data, "edited");
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

  if (error) {
    return fail(
      describeDatabaseError(error, { action: "cancelReservation", distinctId: staff.staffId }),
    );
  }
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
  fireReservationEvent(staff.supabase, staff.staffId, data, "cancelled");
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
    // A new court always lands last (spec 0007, AC-3): the highest live order
    // plus one, or zero when there are no live courts. A caller may still name
    // a position, which spec 0002 allowed.
    if (sortOrder === undefined) {
      const { data: live, error: liveError } = await staff.supabase
        .from("court")
        .select("sort_order")
        .is("retired_at", null);
      if (liveError) {
        return fail(
          describeDatabaseError(liveError, { action: "saveCourt", distinctId: staff.staffId }),
        );
      }
      sortOrder = live && live.length > 0 ? Math.max(...live.map((row) => row.sort_order)) + 1 : 0;
    }
    const { data, error } = await staff.supabase
      .from("court")
      .insert({ name, sort_order: sortOrder, note: note ?? null, changed_by: staff.staffId })
      .select()
      .single();
    if (error) {
      return fail(describeDatabaseError(error, { action: "saveCourt", distinctId: staff.staffId }));
    }
    fireCourtChanged(staff.staffId, data, "created");
    return ok(data);
  }

  if (version === undefined) {
    const message = "Editing a court needs the version you last read.";
    return fail({ kind: "invalid", message, issues: { version: [message] } });
  }
  if (sortOrder === undefined) {
    // The schema already insists on it for an edit; said again so the type narrows.
    const message = "Editing a court needs its current position.";
    return fail({ kind: "invalid", message, issues: { sortOrder: [message] } });
  }

  // Read the row as it stood before the update, the same way `updateReservation`
  // reads the stored start: this is the only way to tell a rename or a note
  // edit from a save that changed nothing (spec 0009, AC-4).
  const { data: prior } = await staff.supabase
    .from("court")
    .select("name, note")
    .eq("id", id)
    .maybeSingle();

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

  if (error) {
    return fail(describeDatabaseError(error, { action: "saveCourt", distinctId: staff.staffId }));
  }
  if (!data) {
    return fail(await explainZeroRows(staff.supabase, "court", { id }, version));
  }
  if (restore) {
    fireCourtChanged(staff.staffId, data, "restored");
  } else if (prior && prior.name !== data.name) {
    fireCourtChanged(staff.staffId, data, "renamed");
  } else if (prior && prior.note !== data.note) {
    fireCourtChanged(staff.staffId, data, "note");
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

  if (countError) {
    return fail(
      describeDatabaseError(countError, { action: "retireCourt", distinctId: staff.staffId }),
    );
  }
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

  if (error) {
    return fail(describeDatabaseError(error, { action: "retireCourt", distinctId: staff.staffId }));
  }
  if (!data) {
    return fail(
      await explainZeroRows(staff.supabase, "court", { id: parsed.data.id }, parsed.data.version),
    );
  }
  fireCourtChanged(staff.staffId, data, "retired");
  return ok(data);
}

/**
 * Every live court in its new order, in one transaction. Spec 0007, AC-5.
 *
 * The list is exactly what was on screen, each entry with the version the
 * page read, and `reorder_courts` refuses the whole list if any of them moved.
 * Row level security still applies inside the function; a non owner gets
 * `forbidden` because the function counts the rows its updates touched.
 */
export async function reorderCourts(input: unknown): Promise<ActionResult<OwnerCourt[]>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(reorderCourtsSchema, input);
  if (!parsed.ok) return fail(parsed.error);

  const { error } = await staff.supabase.rpc("reorder_courts", {
    ids: parsed.data.courts.map((court) => court.id),
    versions: parsed.data.courts.map((court) => court.version),
  });
  if (error) {
    return fail(
      describeDatabaseError(error, { action: "reorderCourts", distinctId: staff.staffId }),
    );
  }

  // The fresh live list, so the page can replace what it holds rather than
  // trusting that its optimistic order is what landed.
  const { data, error: readError } = await staff.supabase
    .from("court")
    .select("id, name, note, sort_order, retired_at, version")
    .is("retired_at", null)
    .order("sort_order");
  if (readError) {
    return fail(
      describeDatabaseError(readError, { action: "reorderCourts", distinctId: staff.staffId }),
    );
  }

  fireCourtChanged(staff.staffId, null, "reordered");
  return ok(
    (data ?? []).map((row): OwnerCourt => ({
      id: row.id,
      name: row.name,
      note: row.note,
      sortOrder: row.sort_order,
      retiredAt: row.retired_at,
      version: row.version,
    })),
  );
}

export async function saveVenueSettings(input: unknown): Promise<ActionResult<VenueSettingsRow>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(saveVenueSettingsSchema, input);
  if (!parsed.ok) return fail(parsed.error);

  // Spec 0007, AC-9: say how many future bookings the new hours would strand,
  // and write nothing until the owner has seen the number. Closures are never
  // counted, and a day beyond a shortened horizon is not this check's business.
  if (!parsed.data.acknowledge) {
    const loaded = await loadSettings(staff.supabase, staff.staffId);
    if (!loaded.ok) return fail(loaded.error);

    const { data: bookings, error: bookingsError } = await staff.supabase
      .from("reservation")
      .select("starts_at, ends_at")
      .eq("kind", "booking")
      .eq("status", "active")
      .gt("ends_at", new Date().toISOString());
    if (bookingsError) {
      return fail(
        describeDatabaseError(bookingsError, {
          action: "saveVenueSettings",
          distinctId: staff.staffId,
        }),
      );
    }

    const count = countOutsideHours(
      (bookings ?? []).map((row) => ({ startsAt: row.starts_at, endsAt: row.ends_at })),
      parsed.data.days,
      loaded.settings.timezone,
    );
    if (count > 0) {
      return fail({
        kind: "conflict",
        reason: "bookings_outside_hours",
        count,
        message: `${count} future booking${count === 1 ? "" : "s"} fall${count === 1 ? "s" : ""} outside these hours.`,
      });
    }
  }

  // The whole week, the slot length and the horizon in one transaction against
  // one version (spec 0007, AC-17), so a half saved week cannot reach the grid.
  // `stale_version` and the row count refusal come back as `version_stale` and
  // `forbidden` through `describeDatabaseError`.
  const { error } = await staff.supabase.rpc("save_venue_hours", {
    days: [...parsed.data.days]
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map((day) => ({
        day_of_week: day.dayOfWeek,
        open_time: day.open,
        close_time: day.close,
      })),
    settings_version: parsed.data.version,
    slot_minutes: parsed.data.slotMinutes,
    booking_horizon_days: parsed.data.bookingHorizonDays,
  });

  if (error) {
    return fail(
      describeDatabaseError(error, { action: "saveVenueSettings", distinctId: staff.staffId }),
    );
  }

  const { data, error: readError } = await staff.supabase
    .from("venue_settings")
    .select()
    .eq("id", true)
    .maybeSingle();
  if (readError) {
    return fail(
      describeDatabaseError(readError, { action: "saveVenueSettings", distinctId: staff.staffId }),
    );
  }
  if (!data) {
    return fail({ kind: "failed", message: "The venue settings row is missing." });
  }

  captureStaffEvent(staff.staffId, "hours_changed", {
    ...summariseWeek(parsed.data.days),
    slot_minutes: data.slot_minutes,
    booking_horizon_days: data.booking_horizon_days,
  });
  return ok(data);
}

/**
 * The week as a shape rather than twenty one values (spec 0007, AC-24). A
 * pattern change is visible in PostHog without a property per day, and a week
 * with no open day reports no earliest or latest, because it has none.
 */
function summariseWeek(days: SaveVenueSettingsInput["days"]) {
  const opens = days.map((day) => day.open).filter((time): time is string => time !== null);
  const closes = days.map((day) => day.close).filter((time): time is string => time !== null);
  // `HH:mm` strings sort the way the times do, `24:00` included.
  const sortedOpens = [...opens].sort();
  const sortedCloses = [...closes].sort();
  return {
    days_open: opens.length,
    days_closed: days.length - opens.length,
    earliest_open: sortedOpens[0] ?? null,
    latest_close: sortedCloses[sortedCloses.length - 1] ?? null,
  };
}
