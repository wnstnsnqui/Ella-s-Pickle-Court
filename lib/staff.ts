import "server-only";

import { auth } from "@clerk/nextjs/server";
import { cache } from "react";

import { describeDatabaseError, fail, ok, requireStaff, type ActionResult } from "@/lib/actions";
import { STAFF_ROLE_DISPLAY_ORDER, type StaffRole } from "@/lib/schedule/constants";
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

export type { StaffRole };

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
        // The check constraint on staff.role is the only guard against a
        // fifth value; this is a straight pass through, not a coercion.
        role: data.role as StaffRole,
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

export type StaffAccount = {
  clerkUserId: string;
  displayName: string;
  email: string | null;
  role: StaffRole;
  isActive: boolean;
  lastSignedInAt: string | null;
  version: number;
};

/**
 * Every staff account, active and inactive alike, for the owner's and
 * superadmin's user management screen. Spec 0012, AC-2.
 *
 * The read itself is not narrowed to owner or superadmin: "active staff may
 * read the staff list" already lets any active staff member read every row,
 * a spec 0004 decision this feature does not change. `/staff/admin/users`
 * restricting itself to owner and superadmin is an application level gate on
 * top of an already broad read, not a new database restriction.
 *
 * Sorted most privileged first (`STAFF_ROLE_DISPLAY_ORDER`), then by name
 * within a role: a role isn't a column Postgres can order on meaningfully
 * (it's a plain check constrained value, not a rank), so this is done here
 * rather than with `.order()`.
 */
export async function getAllStaff(): Promise<ActionResult<StaffAccount[]>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const { data, error } = await staff.supabase
    .from("staff")
    .select("clerk_user_id, display_name, email, role, is_active, last_signed_in_at, version")
    .order("display_name");

  if (error) {
    return fail(describeDatabaseError(error, { action: "getAllStaff", distinctId: staff.staffId }));
  }

  const accounts = (data ?? []).map((row): StaffAccount => ({
    clerkUserId: row.clerk_user_id,
    displayName: row.display_name,
    email: row.email,
    role: row.role as StaffRole,
    isActive: row.is_active,
    lastSignedInAt: row.last_signed_in_at,
    version: row.version,
  }));
  accounts.sort((a, b) => {
    const byRole =
      STAFF_ROLE_DISPLAY_ORDER.indexOf(a.role) - STAFF_ROLE_DISPLAY_ORDER.indexOf(b.role);
    return byRole !== 0 ? byRole : a.displayName.localeCompare(b.displayName);
  });
  return ok(accounts);
}

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
