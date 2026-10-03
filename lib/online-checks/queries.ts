import "server-only";

import { describeDatabaseError, fail, ok, requireStaff, type ActionResult } from "@/lib/actions";
import { isOwnerLevel, type StaffRole } from "@/lib/schedule/constants";

import { CHECKS_LIST_CAP } from "./constants";
import { mergeRuns } from "./format";
import type {
  BookingEventKind,
  BookingStatus,
  OnlineCheckItem,
  OnlineChecks,
  OnlineRun,
  RefundStatus,
  StaffBooking,
} from "./types";

/**
 * The staff check's reads (spec 0016), each with the staff member's own
 * token, so the select policies on `booking`, `booking_event` and
 * `reservation` decide what comes back. Nothing here writes.
 */

type StaffClient =
  Awaited<ReturnType<typeof requireStaff>> extends infer R
    ? R extends { ok: true; supabase: infer S }
      ? S
      : never
    : never;

type LinkedRow = {
  court_id: number;
  starts_at: string;
  ends_at: string;
  status: string;
  created_at: string;
};

const LIST_COLUMNS =
  "id, code, customer_name, amount, reference_last4, status, refund_status, submitted_at, reservation(court_id, starts_at, ends_at, status, created_at)";

/**
 * The rows that stand for a booking (the spec 0016 Decision): its active rows
 * while it is `held`, `pending_check` or `confirmed`, otherwise the rows of its
 * last insert batch, so a retake's rows win over the first hold's.
 */
export function standingRows(status: BookingStatus, rows: readonly LinkedRow[]): LinkedRow[] {
  if (status === "pending_check" || status === "confirmed" || status === "held") {
    const active = rows.filter((row) => row.status === "active");
    if (active.length > 0) return active;
  }
  const latest = rows.reduce<string | null>(
    (max, row) =>
      max === null || Date.parse(row.created_at) > Date.parse(max) ? row.created_at : max,
    null,
  );
  return latest === null
    ? []
    : rows.filter((row) => Date.parse(row.created_at) === Date.parse(latest));
}

function toRuns(rows: readonly LinkedRow[], courtNames: ReadonlyMap<number, string>): OnlineRun[] {
  return mergeRuns(
    rows.map((row) => ({
      courtId: row.court_id,
      courtName: courtNames.get(row.court_id) ?? "Court",
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    })),
  );
}

function firstActiveStart(rows: readonly LinkedRow[]): string | null {
  const starts = rows.filter((row) => row.status === "active").map((row) => row.starts_at);
  if (starts.length === 0) return null;
  return starts.reduce((min, start) => (Date.parse(start) < Date.parse(min) ? start : min));
}

async function courtNamesOf(supabase: StaffClient) {
  // Retired courts too: an old booking still names the court it was on.
  const { data, error } = await supabase.from("court").select("id, name");
  if (error) return { ok: false as const, error };
  return { ok: true as const, names: new Map((data ?? []).map((row) => [row.id, row.name])) };
}

type ListRow = {
  id: number;
  code: string;
  customer_name: string;
  amount: number;
  reference_last4: string | null;
  status: string;
  refund_status: string | null;
  submitted_at: string | null;
  reservation: LinkedRow[];
};

function toItem(row: ListRow, courtNames: ReadonlyMap<number, string>): OnlineCheckItem {
  const status = row.status as BookingStatus;
  return {
    bookingId: row.id,
    code: row.code,
    customerName: row.customer_name,
    amount: Number(row.amount),
    referenceLast4: row.reference_last4,
    status,
    refundStatus: row.refund_status as RefundStatus | null,
    submittedAt: row.submitted_at,
    runs: toRuns(standingRows(status, row.reservation), courtNames),
    firstActiveStartsAt: firstActiveStart(row.reservation),
  };
}

/**
 * The chip and the list (AC-1, AC-2): every booking waiting for its check,
 * soonest first slot first, and every refund owed, oldest first. A venue this
 * size has a handful waiting; the unchecked ones are read whole so the sort
 * by first slot is right, then capped at 50 like the refunds.
 */
export async function getOnlineChecks(): Promise<ActionResult<OnlineChecks>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);
  const { supabase, staffId } = staff;
  const serverNow = new Date();

  const [pending, refunds, courts] = await Promise.all([
    supabase
      .from("booking")
      .select(LIST_COLUMNS, { count: "exact" })
      .eq("status", "pending_check")
      .order("id")
      .limit(1000),
    supabase
      .from("booking")
      .select(LIST_COLUMNS, { count: "exact" })
      .eq("refund_status", "owed")
      .order("submitted_at", { ascending: true, nullsFirst: false })
      .order("id")
      .limit(CHECKS_LIST_CAP),
    courtNamesOf(supabase),
  ]);

  const error = pending.error ?? refunds.error ?? (courts.ok ? null : courts.error);
  if (error)
    return fail(describeDatabaseError(error, { action: "getOnlineChecks", distinctId: staffId }));
  if (!courts.ok) return fail({ kind: "failed", message: "The courts did not load." });

  const toCheck = ((pending.data ?? []) as ListRow[])
    .map((row) => toItem(row, courts.names))
    .sort((a, b) => {
      const aStart = a.firstActiveStartsAt ? Date.parse(a.firstActiveStartsAt) : Infinity;
      const bStart = b.firstActiveStartsAt ? Date.parse(b.firstActiveStartsAt) : Infinity;
      return aStart - bStart || a.bookingId - b.bookingId;
    });
  const toCheckCount = pending.count ?? toCheck.length;
  const refundCount = refunds.count ?? (refunds.data ?? []).length;

  return ok({
    toCheck: toCheck.slice(0, CHECKS_LIST_CAP),
    refundsOwed: ((refunds.data ?? []) as ListRow[]).map((row) => toItem(row, courts.names)),
    toCheckCount,
    refundCount,
    more: { toCheck: toCheckCount > CHECKS_LIST_CAP, refunds: refundCount > CHECKS_LIST_CAP },
    serverNow: serverNow.toISOString(),
  });
}

/**
 * One online booking as the details sheet shows it (AC-6). `canDecide` is the
 * viewer's own staff row read with their token, the same test
 * `private.is_owner()` applies; the decision functions still apply it again
 * on every write.
 */
export async function getStaffBooking(bookingId: number): Promise<ActionResult<StaffBooking>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);
  const { supabase, staffId } = staff;

  const [booking, events, staffRows, courts] = await Promise.all([
    supabase
      .from("booking")
      .select(
        "id, code, status, version, amount, customer_name, customer_phone, customer_email, reference_last4, submitted_at, refund_status, refund_amount, refunded_at, refunded_by, proof_path, reservation(court_id, starts_at, ends_at, status, created_at)",
      )
      .eq("id", bookingId)
      .maybeSingle(),
    supabase
      .from("booking_event")
      .select("id, kind, reason, note, refund_owed, amount, staff_id, created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    // The whole table, so a leaver's name still resolves on what they decided.
    supabase.from("staff").select("user_id, display_name, role, is_active"),
    courtNamesOf(supabase),
  ]);

  const error =
    booking.error ?? events.error ?? staffRows.error ?? (courts.ok ? null : courts.error);
  if (error) {
    return fail(describeDatabaseError(error, { action: "getStaffBooking", distinctId: staffId }));
  }
  if (!courts.ok) return fail({ kind: "failed", message: "The courts did not load." });
  if (!booking.data)
    return fail({ kind: "not_found", message: "That online booking is not there." });

  const people = staffRows.data ?? [];
  const nameOf = (userId: string | null) =>
    people.find((person) => person.user_id === userId)?.display_name.split(" ")[0] ??
    "a staff member";
  const me = people.find((person) => person.user_id === staffId);
  const row = booking.data;
  const status = row.status as BookingStatus;

  return ok({
    id: row.id,
    code: row.code,
    status,
    version: row.version,
    amount: Number(row.amount),
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    referenceLast4: row.reference_last4,
    submittedAt: row.submitted_at,
    refundStatus: row.refund_status as RefundStatus | null,
    refundAmount: row.refund_amount === null ? null : Number(row.refund_amount),
    refundedAt: row.refunded_at,
    refundedByName: row.refunded_by ? nameOf(row.refunded_by) : null,
    hasProof: row.proof_path !== null,
    runs: toRuns(standingRows(status, row.reservation), courts.names),
    events: (events.data ?? []).map((event) => ({
      id: event.id,
      kind: event.kind as BookingEventKind,
      reason: event.reason,
      note: event.note,
      refundOwed: event.refund_owed,
      amount: event.amount === null ? null : Number(event.amount),
      staffName: nameOf(event.staff_id),
      at: event.created_at,
    })),
    canDecide: me !== undefined && me.is_active && isOwnerLevel(me.role as StaffRole),
  });
}

/** The booking a typed code belongs to, in any state (AC-3). Exact match only. */
export async function getBookingIdByCode(
  code: string,
): Promise<ActionResult<{ bookingId: number }>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const { data, error } = await staff.supabase
    .from("booking")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    return fail(
      describeDatabaseError(error, { action: "findOnlineBooking", distinctId: staff.staffId }),
    );
  }
  if (!data) return fail({ kind: "not_found", message: "No online booking with that code." });
  return ok({ bookingId: data.id });
}

/** The screenshot's path, never sent to the browser: only `getProofUrl` reads it. */
export async function getProofPath(
  supabase: StaffClient,
  bookingId: number,
): Promise<
  { ok: true; path: string | null } | { ok: false; error: { code?: string; message: string } }
> {
  const { data, error } = await supabase
    .from("booking")
    .select("proof_path")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) return { ok: false, error };
  return { ok: true, path: data?.proof_path ?? null };
}
