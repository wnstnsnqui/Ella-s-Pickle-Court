import "server-only";

import { auth } from "@clerk/nextjs/server";
import { cache } from "react";

import { staffSupabase } from "@/lib/supabase/staff";

/**
 * Who is signed in, as the database sees them. Spec 0004.
 *
 * `currentStaff()` is the one place the app asks "is this person staff, and what
 * are they called?" For a signed in person it calls `ensure_staff()`, the
 * Postgres function that creates or refreshes their own `staff` row from the
 * claims on their Clerk token. So the row exists before any write, and the name
 * in the header is the name `changed_by` will resolve to (AC-3).
 *
 * Wrapped in React `cache()` so a request asks once however many components
 * want the answer. The call carries a 3 second abort: a slow or missing database
 * becomes the "Could not load your account" notice, never a hung board (AC-8).
 * `requireStaff()` in `lib/actions.ts` stays a pure Clerk check; whether an
 * inactive account may write is still decided by row level security.
 */

export type StaffRole = "staff" | "owner";

export type Staff = {
  displayName: string;
  role: StaffRole;
  isActive: boolean;
  /** Which privacy notice version this person last acknowledged, or null. Spec 0010, AC-10. */
  privacyAcknowledgedVersion: string | null;
};

export type CurrentStaff =
  { kind: "signed_out" } | { kind: "ok"; staff: Staff } | { kind: "error" };

/** How long the board waits for the staff row before giving up on it. */
export const ENSURE_STAFF_TIMEOUT_MS = 3000;

export const currentStaff = cache(async (): Promise<CurrentStaff> => {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return { kind: "signed_out" };

  try {
    const { data, error } = await staffSupabase()
      .rpc("ensure_staff")
      .abortSignal(AbortSignal.timeout(ENSURE_STAFF_TIMEOUT_MS))
      .single();
    if (error) throw error;
    return {
      kind: "ok",
      staff: {
        displayName: data.display_name,
        role: data.role === "owner" ? "owner" : "staff",
        isActive: data.is_active,
        privacyAcknowledgedVersion: data.privacy_acknowledged_version,
      },
    };
  } catch (error) {
    // A thrown RPC error, a Postgres error result, or the abort all land here.
    // One string on purpose: the dev log flattens an object argument to `{}`,
    // which hides the one line that says what went wrong.
    console.error(`currentStaff: could not create or read the staff row: ${describeError(error)}`);
    return { kind: "error" };
  }
});

/** The parts of an error worth a log line, whatever shape it arrived in. */
function describeError(error: unknown): string {
  if (error && typeof error === "object") {
    const { name, code, message, hint } = error as Record<string, unknown>;
    return [name ?? "Error", code ? `${code}` : null, message, hint ? `(hint: ${hint})` : null]
      .filter(Boolean)
      .join(" ");
  }
  return String(error);
}
