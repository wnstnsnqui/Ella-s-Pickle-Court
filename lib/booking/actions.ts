"use server";

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { z } from "zod";

import { capturePublicEvent, reportFailure } from "@/lib/analytics/server";
import { publicEnv, VENUE_TIMEZONE } from "@/lib/env";
import { BOOKING_TERMS_VERSION } from "@/lib/legal/constants";
import { clientAddress } from "@/lib/rate-limit";
import type { Database } from "@/lib/supabase/database.types";
import { publicSupabase } from "@/lib/supabase/public";
import { mintOnlineBookingToken } from "@/lib/supabase/staff-token";
import { daysBetween, todayInZone } from "@/lib/time";

import { countSlots, heldEventProperties } from "./analytics";
import { hashClient } from "./client-hash";
import {
  holdAnswerSchema,
  holdInputSchema,
  releaseAnswerSchema,
  releaseInputSchema,
  submitAnswerSchema,
  submitInputSchema,
} from "./schemas";
import { verifyTurnstile } from "./turnstile";
import type { HoldRefusal, HoldResult, ReleaseResult, SubmitRefusal, SubmitResult } from "./types";

/**
 * The public checkout's Server Actions. Spec 0015.
 *
 * The second named exception to "`requireStaff()` first", beside
 * `lib/auth/actions.ts`: a player has no account. The gate here is the
 * server's own checks (Zod, then Turnstile for a hold, or the unguessable
 * `submission_id` for everything after it) and then a 60 second
 * `online_booking` token, which can run the online booking functions
 * and write one proof object, and nothing else. Postgres decides every rule
 * that matters: the slots, the hours, the price, the overlaps and the rate
 * limit. Writes are keyed on the sheet's `submission_id`, not on a `version`,
 * and record no `changed_by`, because nobody signed in made them.
 */

const PROOF_BUCKET = "payment-proof";

/**
 * A client for one checkout call, carrying a token minted for this caller's
 * client hash. Built fresh per call and never shared, exactly like
 * `staffSupabase()`: the token belongs to one request.
 */
function onlineBookingSupabase(clientHash: string): SupabaseClient<Database> {
  const env = publicEnv();
  const token = mintOnlineBookingToken(clientHash);
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    accessToken: () => token,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const FAILED: HoldRefusal = {
  kind: "failed",
  message: "We couldn't hold your slots just now. Try again, or message us to book.",
};

const BOT_CHECK: HoldRefusal = {
  kind: "bot_check",
  message: "We couldn't check this device. Try again.",
};

/**
 * Hold the picked hours for 5 minutes (AC-4), or, when this sheet already
 * holds them, update the details in place (AC-5). Answers with the code, the
 * expiry on the database's clock, the amount the database worked out, and a
 * signed URL for the payment screenshot.
 */
export async function holdOnlineBooking(input: unknown): Promise<HoldResult> {
  const parsed = holdInputSchema.safeParse(input);
  if (!parsed.success) {
    console.warn("holdOnlineBooking: refused a malformed request");
    return {
      ok: false,
      error: {
        kind: "invalid",
        message: "Check your details and try again.",
        issues: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
      },
    };
  }
  const hold = parsed.data;
  const address = clientAddress(await headers());

  // AC-19: nothing is minted for a caller Siteverify has not vouched for.
  if (!(await verifyTurnstile(hold.turnstileToken, address))) {
    capturePublicEvent("online_booking_refused", { stage: "hold", reason: "bot_check" });
    return { ok: false, error: BOT_CHECK };
  }

  const supabase = onlineBookingSupabase(hashClient(address));

  const { data, error } = await supabase.rpc("hold_online_booking", {
    p_submission_id: hold.submissionId,
    p_day: hold.date,
    p_picks: hold.picks.map((pick) => ({ court_id: pick.courtId, starts_at: pick.startsAt })),
    p_name: hold.name,
    p_phone: hold.phone,
    p_email: hold.email,
    p_terms_version: BOOKING_TERMS_VERSION,
  });
  if (error) {
    reportFailure(error, { action: "holdOnlineBooking" });
    return { ok: false, error: FAILED };
  }

  const answer = holdAnswerSchema.safeParse(data);
  if (!answer.success) {
    reportFailure(
      { message: "hold_online_booking answered in an unexpected shape" },
      { action: "holdOnlineBooking" },
    );
    return { ok: false, error: FAILED };
  }

  const held = answer.data;
  if (!held.ok) {
    const refused = refusal(held);
    if (refused.kind !== "invalid") {
      capturePublicEvent("online_booking_refused", { stage: "hold", reason: refused.kind });
    }
    return { ok: false, error: refused };
  }

  // Made under the same minted role, so Storage's own policies decide: the
  // path must be this booking's issued proof path, and it must not be
  // submitted yet. `upsert` lets Replace and Retry overwrite the same object.
  const upload = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUploadUrl(held.proof_path, { upsert: true });
  if (upload.error) {
    reportFailure(upload.error, { action: "holdOnlineBooking" });
    return { ok: false, error: FAILED };
  }

  capturePublicEvent(
    "online_booking_held",
    heldEventProperties(hold.picks, daysBetween(todayInZone(VENUE_TIMEZONE), hold.date)),
  );

  return {
    ok: true,
    data: {
      code: held.code,
      holdExpiresAt: held.hold_expires_at,
      serverNow: held.server_now,
      amount: held.amount,
      runs: held.runs.map((run) => ({
        courtId: run.court_id,
        startsAt: run.starts_at,
        endsAt: run.ends_at,
        amount: run.amount,
      })),
      upload: { signedUrl: upload.data.signedUrl },
    },
  };
}

function refusal(
  answer: Extract<z.infer<typeof holdAnswerSchema>, { ok: false }>,
): Extract<HoldRefusal, { kind: "slot_taken" | "out_of_range" | "rate_limited" | "invalid" }> {
  switch (answer.reason) {
    case "slot_taken":
      return {
        kind: "slot_taken",
        message: "Somebody booked one of your hours just now.",
        slots: (answer.slots ?? []).map((slot) => ({
          courtId: slot.court_id,
          startsAt: slot.starts_at,
        })),
      };
    case "out_of_range":
      return { kind: "out_of_range", message: "The hours changed. Pick your hours again." };
    case "rate_limited":
      return {
        kind: "rate_limited",
        message: "Too many tries from this connection.",
        retryAfterSeconds: answer.retry_after_seconds ?? 900,
      };
    case "invalid":
      console.warn("holdOnlineBooking: the database refused the details as invalid");
      return { kind: "invalid", message: "Check your details and try again.", issues: {} };
  }
}

const SUBMIT_FAILED: SubmitRefusal = {
  kind: "failed",
  message: "We couldn't confirm your booking just now. Try again, or message us with your code.",
};

/**
 * Confirm the booking (AC-12). The `submission_id` is the capability and the
 * digits are the only other input: the database checks the proof is at the
 * path it issued, then books a live hold, retakes a lapsed one's slots, or
 * keeps the payment on an expired booking when a slot is gone (AC-13).
 * Repeating the call answers the same way and never books twice.
 */
export async function submitOnlineBooking(input: unknown): Promise<SubmitResult> {
  const parsed = submitInputSchema.safeParse(input);
  if (!parsed.success) {
    console.warn("submitOnlineBooking: refused a malformed request");
    return { ok: false, error: { kind: "invalid", message: "Check the reference digits." } };
  }
  const submit = parsed.data;

  const supabase = onlineBookingSupabase(hashClient(clientAddress(await headers())));

  const { data, error } = await supabase.rpc("submit_online_booking", {
    p_submission_id: submit.submissionId,
    p_reference_last4: submit.referenceLast4,
  });
  if (error) {
    reportFailure(error, { action: "submitOnlineBooking" });
    return { ok: false, error: SUBMIT_FAILED };
  }

  const answer = submitAnswerSchema.safeParse(data);
  if (!answer.success) {
    reportFailure(
      { message: "submit_online_booking answered in an unexpected shape" },
      { action: "submitOnlineBooking" },
    );
    return { ok: false, error: SUBMIT_FAILED };
  }

  const done = answer.data;
  if (!done.ok) {
    switch (done.reason) {
      case "slot_taken":
        capturePublicEvent("online_booking_refused", { stage: "submit", reason: "slot_taken" });
        return {
          ok: false,
          error: {
            kind: "slot_taken",
            message: "Somebody booked one of your hours while your hold was over.",
            slots: (done.slots ?? []).map((slot) => ({
              courtId: slot.court_id,
              startsAt: slot.starts_at,
            })),
          },
        };
      case "proof_missing":
        capturePublicEvent("online_booking_refused", { stage: "submit", reason: "proof_missing" });
        return {
          ok: false,
          error: {
            kind: "proof_missing",
            message: "We couldn't find your screenshot. Upload it again, then confirm.",
          },
        };
      case "not_found":
        console.warn("submitOnlineBooking: no booking for this submission");
        return {
          ok: false,
          error: {
            kind: "not_found",
            message: "We couldn't find this booking. Close this and pick your hours again.",
          },
        };
      case "invalid":
        console.warn("submitOnlineBooking: the database refused the submission as invalid");
        return { ok: false, error: { kind: "invalid", message: "Check the reference digits." } };
    }
  }

  captureSubmitted(done.runs, done.retaken);

  // The player's own receipt: their code and digits, never the proof path.
  return {
    ok: true,
    data: {
      code: done.code,
      status: done.status,
      amount: done.amount,
      runs: done.runs.map((run) => ({
        courtId: run.court_id,
        startsAt: run.starts_at,
        endsAt: run.ends_at,
        amount: run.amount,
      })),
      customer: done.customer,
      payment: { referenceLast4: done.reference_last4, submittedAt: done.submitted_at },
      retaken: done.retaken,
    },
  };
}

/**
 * `online_booking_submitted` counts slots, and the submit answer carries runs,
 * so the slot length is read from the public settings row. Off the action's
 * path: the receipt never waits on it, and a failed read sends nothing.
 */
function captureSubmitted(runs: { starts_at: string; ends_at: string }[], retaken: boolean): void {
  void publicSupabase()
    .from("venue_settings")
    .select("slot_minutes")
    .maybeSingle()
    .then(
      ({ data }) => {
        if (!data) return;
        capturePublicEvent("online_booking_submitted", {
          slots: countSlots(runs, data.slot_minutes),
          retaken,
        });
      },
      () => undefined,
    );
}

/**
 * The player closed the sheet on a live hold (AC-15): end it now, so the
 * slots free on both boards straight away rather than when the minute job
 * reaches them. Nothing is shown either way; a failure is logged and the job
 * frees the slots within a minute of the hold's end.
 */
export async function releaseOnlineBooking(input: unknown): Promise<ReleaseResult> {
  const parsed = releaseInputSchema.safeParse(input);
  if (!parsed.success) {
    console.warn("releaseOnlineBooking: refused a malformed request");
    return { released: false };
  }

  const supabase = onlineBookingSupabase(hashClient(clientAddress(await headers())));

  const { data, error } = await supabase.rpc("release_online_booking", {
    p_submission_id: parsed.data.submissionId,
  });
  if (error) {
    reportFailure(error, { action: "releaseOnlineBooking" });
    return { released: false };
  }

  const answer = releaseAnswerSchema.safeParse(data);
  if (!answer.success) {
    reportFailure(
      { message: "release_online_booking answered in an unexpected shape" },
      { action: "releaseOnlineBooking" },
    );
    return { released: false };
  }
  if (!answer.data.ok) {
    console.warn("releaseOnlineBooking: the database refused the release as invalid");
    return { released: false };
  }
  return { released: answer.data.released };
}
