import "server-only";

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

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
  | { kind: "invalid"; message: string; issues: Record<string, string[]> }
  | { kind: "conflict"; message: string; reason?: ConflictReason; count?: number }
  | { kind: "failed"; message: string };

/**
 * Why a write lost. `slot_taken` is the one spec 0002 cares most about: it is
 * the exclusion constraint refusing a double booking, and it must arrive as a
 * named conflict rather than a raw database error (AC-2).
 */
export type ConflictReason =
  "slot_taken" | "version_stale" | "sort_order_taken" | "court_has_bookings";

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T>(error: ActionError): ActionResult<T> {
  return { ok: false, error };
}

/**
 * Confirm there is a Clerk session and hand back a Supabase client carrying that
 * person's token. Call this at the top of every Server Action, before touching
 * the database.
 */
export async function requireStaff() {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) {
    return {
      ok: false as const,
      error: {
        kind: "unauthenticated" as const,
        message: "Sign in to change a court.",
      },
    };
  }
  return { ok: true as const, staffId: userId, supabase: staffSupabase() };
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
 * It is never surfaced as a raw error and never swallowed. `42501` is row level
 * security refusing the write, which is an authorization answer, not a failure.
 */
export function describeDatabaseError(error: DatabaseError): ActionError {
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
  }
  if (error.code === "42501") {
    return {
      kind: "forbidden",
      message: "Your account is not allowed to make that change.",
    };
  }
  return { kind: "failed", message: error.message };
}
