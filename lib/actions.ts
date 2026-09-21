import "server-only";

import { z } from "zod";

import { reportFailure } from "@/lib/analytics/server";
import { currentSession } from "@/lib/auth/session";
import { staffSupabase } from "@/lib/supabase/staff";

/**
 * The shared shape every Server Action returns, and the guard every one of them
 * runs first. Architecture rules 3, 6 and 11 in spec 0001.
 *
 * Nothing here replaces row level security. The database is still the enforcement
 * point. These checks exist so a signed out caller or a malformed payload gets a
 * clear, typed answer instead of an opaque policy denial that is painful to debug.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export type ActionError =
  | { kind: "unauthenticated"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "invalid"; message: string; issues: Record<string, string[]>; reason?: InvalidReason }
  | { kind: "conflict"; message: string; reason?: ConflictReason; count?: number }
  | { kind: "failed"; message: string };

/**
 * Why a write lost. `slot_taken` is the one spec 0002 cares most about: it is
 * the exclusion constraint refusing a double booking, and it must arrive as a
 * named conflict rather than a raw database error (AC-2).
 */
/**
 * Why an input was refused, when a screen needs to tell one refusal from
 * another. `out_of_range` is the day a board is showing having fallen past the
 * booking horizon (spec 0007, AC-12): the board goes back to today rather than
 * showing an error.
 */
export type InvalidReason = "out_of_range";

export type ConflictReason =
  | "slot_taken"
  | "version_stale"
  | "sort_order_taken"
  | "court_has_bookings"
  | "name_taken"
  | "bookings_outside_hours";

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T>(error: ActionError): ActionResult<T> {
  return { ok: false, error };
}

/**
 * Confirm there is a Better Auth session and hand back a Supabase client
 * carrying a token minted for that person. Call this at the top of every
 * Server Action, before touching the database. The three pre authentication
 * actions in `lib/auth/actions.ts` are the one named exception (spec 0004,
 * invariant 7a): the person has no session yet, and a link claimed in
 * Postgres is their gate.
 */
export async function requireStaff() {
  const session = await currentSession();
  if (!session) {
    return {
      ok: false as const,
      error: {
        kind: "unauthenticated" as const,
        message: "Sign in to change a court.",
      },
    };
  }
  return { ok: true as const, staffId: session.user.id, supabase: staffSupabase() };
}

/**
 * Validate a Server Action payload. Server Actions accept whatever the network
 * sends, so nothing reaches the database before it has been through a schema.
 */
export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
): { ok: true; data: z.infer<S> } | { ok: false; error: ActionError } {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    error: {
      kind: "invalid",
      message: "That request did not look right.",
      issues: z.flattenError(result.error).fieldErrors as Record<string, string[]>,
    },
  };
}

/**
 * The shape a Postgres error arrives in through PostgREST. Only the two fields
 * the mapping below reads are named.
 */
type DatabaseError = { code?: string; message: string };

/**
 * Translate a database refusal into a typed result.
 *
 * SQLSTATE `23P01` on `reservation_no_overlap` is the exclusion constraint
 * doing its job, and it is the whole reason the data model is shaped this way.
 * It is never surfaced as a raw error and never swallowed. `23505` on one of
 * the two partial unique indexes on `court` is a named conflict too. `42501`
 * is row level security refusing the write, which is an authorization answer,
 * not a failure. `PGRST301` and `PGRST303` are PostgREST turning away an
 * expired or otherwise unusable minted token; `PGRST302` is a token that is not
 * valid *yet*, a clock skew answer rather than an expired one. All three are a
 * session answer, not a broken query.
 */
/**
 * `action` names the Server Action that ran, for `reportFailure()`; `distinctId`
 * is the staff member's user id, when one is known. Only the final, unnamed
 * `failed` branch is ever reported: `slot_taken` and the other named
 * conflicts are expected outcomes and are never captured (spec 0009, AC-7).
 */
export function describeDatabaseError(
  error: DatabaseError,
  context: { action: string; distinctId?: string },
): ActionError {
  if (error.code === "23P01" && error.message.includes("reservation_no_overlap")) {
    return {
      kind: "conflict",
      reason: "slot_taken",
      message: "That court is already taken for those hours.",
    };
  }
  if (error.code === "23P01" || error.code === "23505") {
    if (error.message.includes("court_live_sort_order_idx")) {
      return {
        kind: "conflict",
        reason: "sort_order_taken",
        message: "Another court already sits in that position.",
      };
    }
    if (error.message.includes("court_live_name_idx")) {
      return {
        kind: "conflict",
        reason: "name_taken",
        message: "Another court already has that name.",
      };
    }
  }
  // `reorder_courts` refusing a list whose versions no longer match (spec 0007,
  // AC-5), and `update_staff_role` refusing a stale role or active change
  // (spec 0012, AC-8): the same P0002 code, from either a mismatched version
  // or a target row that no longer exists, mapped to the same named conflict.
  if (error.code === "P0002") {
    return {
      kind: "conflict",
      reason: "version_stale",
      message:
        context.action === "updateStaffRole"
          ? "Somebody else changed that account first. The list has been reloaded."
          : context.action === "revokeStaffInvite"
            ? "That link was already used or revoked. The list has been reloaded."
            : "Somebody else changed the courts first. The list has been reloaded.",
    };
  }
  if (error.code === "42501") {
    return {
      kind: "forbidden",
      message: "Your account is not allowed to make that change.",
    };
  }
  // PostgREST refusing the caller's minted token. It reads as `unauthenticated`
  // so the desk sees a plain sentence rather than a database string, and it is
  // never captured as an exception: an `unauthenticated` answer is expected,
  // not a failure (spec 0009, AC-7). `PGRST302` gets its own message because
  // re-authenticating does nothing for a clock skew that will pass on its own.
  if (error.code === "PGRST301" || error.code === "PGRST303") {
    return {
      kind: "unauthenticated",
      message: "Your session has expired. Sign in again.",
    };
  }
  if (error.code === "PGRST302") {
    return {
      kind: "unauthenticated",
      message: "Your session isn't valid yet. Try again in a moment.",
    };
  }
  reportFailure(error, context);
  return { kind: "failed", message: error.message };
}
