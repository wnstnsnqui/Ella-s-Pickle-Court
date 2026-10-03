"use server";

import "server-only";

import {
  describeDatabaseError,
  fail,
  ok,
  parseInput,
  requireStaff,
  type ActionError,
  type ActionResult,
} from "@/lib/actions";
import { captureStaffEvent, reportFailure } from "@/lib/analytics/server";

import {
  CODE_INVALID_MESSAGE,
  MANAGERS_ONLY_MESSAGE,
  PROOF_URL_SECONDS,
  STALE_MESSAGE,
} from "./constants";
import { getBookingIdByCode, getOnlineChecks, getProofPath, getStaffBooking } from "./queries";
import {
  bookingRefSchema,
  cancelInputSchema,
  confirmInputSchema,
  decisionAnswerSchema,
  findBookingSchema,
  rejectInputSchema,
  settleInputSchema,
  type DecisionAnswer,
} from "./schemas";
import type { DecisionResult, OnlineChecks, ProofUrl, StaffBooking } from "./types";

/**
 * The staff check's Server Actions (spec 0016). The reads delegate to
 * `queries.ts`, which runs `requireStaff()` itself. Every write runs
 * `requireStaff()` first, then Zod, then one decision function, and the
 * function decides who may: the owner check, the version guard and the
 * history line all live in Postgres. The analytics event goes only after a
 * successful write, and is never awaited.
 */

/** The chip and the list, refetched on every live event (AC-1, AC-2, AC-5). */
export async function refreshOnlineChecks(): Promise<ActionResult<OnlineChecks>> {
  return getOnlineChecks();
}

/** One booking for the details sheet, from a cell, the list or a code (AC-6). */
export async function loadStaffBooking(input: unknown): Promise<ActionResult<StaffBooking>> {
  const parsed = parseInput(bookingRefSchema, input);
  if (!parsed.ok) return fail(parsed.error);
  return getStaffBooking(parsed.data.bookingId);
}

/** Exact code search, in any state (AC-3). Nothing shorter than 8 valid characters is asked. */
export async function findOnlineBooking(
  input: unknown,
): Promise<ActionResult<{ bookingId: number }>> {
  const parsed = findBookingSchema.safeParse(input);
  if (!parsed.success) {
    return fail({
      kind: "invalid",
      message: CODE_INVALID_MESSAGE,
      issues: { code: [CODE_INVALID_MESSAGE] },
    });
  }
  return getBookingIdByCode(parsed.data.code);
}

/**
 * A 5 minute URL for a booking's screenshot, signed with the staff member's
 * own token (AC-17). The URL is handed back and never logged, stored or sent
 * to analytics.
 */
export async function getProofUrl(input: unknown): Promise<ActionResult<ProofUrl>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(bookingRefSchema, input);
  if (!parsed.ok) return fail(parsed.error);

  const found = await getProofPath(staff.supabase, parsed.data.bookingId);
  if (!found.ok) {
    return fail(
      describeDatabaseError(found.error, { action: "getProofUrl", distinctId: staff.staffId }),
    );
  }
  if (found.path === null) return fail({ kind: "not_found", message: "Screenshot deleted" });

  const issuedAt = Date.now();
  const { data, error } = await staff.supabase.storage
    .from("payment-proof")
    .createSignedUrl(found.path, PROOF_URL_SECONDS);
  if (error || !data) {
    // The path is not in the message; Storage answers with its own words.
    reportFailure(new Error(`createSignedUrl failed: ${error?.message ?? "no URL"}`), {
      action: "getProofUrl",
      distinctId: staff.staffId,
    });
    return fail({ kind: "failed", message: "The screenshot did not load." });
  }
  return ok({
    url: data.signedUrl,
    expiresAt: new Date(issuedAt + PROOF_URL_SECONDS * 1000).toISOString(),
  });
}

type Success = Extract<DecisionAnswer, { ok: true }>;

/**
 * One decision function's answer as a result. A refusal is an answer, not a
 * fault: `stale`, `wrong_state` and `forbidden` are logged with `console.warn`
 * only (AC-19), and the sheet reads the booking again on the first two (AC-14).
 */
function toDecision(
  action: string,
  staffId: string,
  answer: { data: unknown; error: { code?: string; message: string } | null },
): { ok: true; success: Success } | { ok: false; error: ActionError } {
  if (answer.error) {
    return {
      ok: false,
      error: describeDatabaseError(answer.error, { action, distinctId: staffId }),
    };
  }
  const parsed = decisionAnswerSchema.safeParse(answer.data);
  if (!parsed.success) {
    reportFailure(new Error(`${action}: unexpected answer`), { action, distinctId: staffId });
    return { ok: false, error: { kind: "failed", message: "The change did not go through." } };
  }
  const result = parsed.data;
  if (result.ok) return { ok: true, success: result };

  switch (result.reason) {
    case "stale":
    case "wrong_state":
      console.warn(`${action}: ${result.reason}`);
      return {
        ok: false,
        error: {
          kind: "conflict",
          reason: result.reason === "stale" ? "version_stale" : "wrong_state",
          message: STALE_MESSAGE,
        },
      };
    case "forbidden":
      console.warn(`${action}: forbidden`);
      return { ok: false, error: { kind: "forbidden", message: MANAGERS_ONLY_MESSAGE } };
    case "not_found":
      return {
        ok: false,
        error: { kind: "not_found", message: "That online booking is not there." },
      };
    case "invalid":
      return {
        ok: false,
        error: { kind: "invalid", message: "That request did not look right.", issues: {} },
      };
  }
}

/** Whole minutes from the player's submit to the decision, for AC-19. */
function minutesWaiting(success: Success): number {
  if (!success.submitted_at) return 0;
  const ms = Date.parse(success.decided_at) - Date.parse(success.submitted_at);
  return Math.max(0, Math.floor(ms / 60_000));
}

/** Confirm payment (AC-7). */
export async function confirmOnlineBooking(input: unknown): Promise<ActionResult<DecisionResult>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(confirmInputSchema, input);
  if (!parsed.ok) return fail(parsed.error);

  const answer = await staff.supabase.rpc("confirm_online_booking", {
    p_booking_id: parsed.data.bookingId,
    p_version: parsed.data.version,
  });
  const decision = toDecision("confirmOnlineBooking", staff.staffId, answer);
  if (!decision.ok) return fail(decision.error);

  captureStaffEvent(staff.staffId, "online_booking_confirmed", {
    minutes_waiting: minutesWaiting(decision.success),
  });
  return ok({ version: decision.success.version });
}

/** Turn down payment (AC-8). */
export async function rejectOnlineBooking(input: unknown): Promise<ActionResult<DecisionResult>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(rejectInputSchema, input);
  if (!parsed.ok) return fail(parsed.error);
  const { bookingId, version, reason, note, refundOwed } = parsed.data;

  const answer = await staff.supabase.rpc("reject_online_booking", {
    p_booking_id: bookingId,
    p_version: version,
    p_reason: reason,
    // An empty note is no note: the function trims it to null.
    p_note: note ?? "",
    p_refund_owed: refundOwed,
  });
  const decision = toDecision("rejectOnlineBooking", staff.staffId, answer);
  if (!decision.ok) return fail(decision.error);

  captureStaffEvent(staff.staffId, "online_booking_rejected", {
    reason,
    refund_owed: refundOwed,
    was_confirmed: decision.success.previous_status === "confirmed",
  });
  return ok({ version: decision.success.version });
}

/** Cancel the whole online booking (AC-10). */
export async function cancelOnlineBooking(input: unknown): Promise<ActionResult<DecisionResult>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(cancelInputSchema, input);
  if (!parsed.ok) return fail(parsed.error);
  const { bookingId, version, reason, note, refundOwed } = parsed.data;

  const answer = await staff.supabase.rpc("cancel_online_booking", {
    p_booking_id: bookingId,
    p_version: version,
    p_reason: reason,
    p_note: note ?? "",
    p_refund_owed: refundOwed,
  });
  const decision = toDecision("cancelOnlineBooking", staff.staffId, answer);
  if (!decision.ok) return fail(decision.error);

  captureStaffEvent(staff.staffId, "online_booking_cancelled", {
    reason,
    refund_owed: refundOwed,
    was_confirmed: decision.success.previous_status === "confirmed",
  });
  return ok({ version: decision.success.version });
}

/** Mark refunded, or No refund needed (AC-12). */
export async function settleOnlineRefund(input: unknown): Promise<ActionResult<DecisionResult>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(settleInputSchema, input);
  if (!parsed.ok) return fail(parsed.error);
  const settle = parsed.data;

  const answer = await staff.supabase.rpc("settle_online_refund", {
    p_booking_id: settle.bookingId,
    p_version: settle.version,
    p_outcome: settle.outcome,
    // Read only for `refunded`; the function ignores it otherwise.
    p_amount: settle.outcome === "refunded" ? settle.amount : 0,
    p_note: settle.note ?? "",
  });
  const decision = toDecision("settleOnlineRefund", staff.staffId, answer);
  if (!decision.ok) return fail(decision.error);

  captureStaffEvent(staff.staffId, "online_booking_refund_settled", { outcome: settle.outcome });
  return ok({ version: decision.success.version });
}
