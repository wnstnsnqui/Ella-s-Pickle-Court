"use server";

import { z } from "zod";

import {
  describeDatabaseError,
  fail,
  ok,
  parseInput,
  requireStaff,
  type ActionResult,
} from "@/lib/actions";
import { captureStaffEvent } from "@/lib/analytics/server";
import { staffRoleSchema } from "@/lib/schedule/schemas";
import { getAllStaff, type StaffAccount } from "@/lib/staff";

/**
 * The one write behind `/staff/admin/users`. Spec 0012, AC-4 and AC-5.
 *
 * `update_staff_role()` is the enforcement point: owner or superadmin only,
 * refused for a caller acting on their own row, and demoting a previous
 * owner in the same transaction as a transfer. This wrapper is the Server
 * Action boundary spec 0001 requires; it adds nothing the function does not
 * already check.
 */
const updateStaffRoleSchema = z.object({
  clerkUserId: z.string().min(1),
  role: staffRoleSchema,
  isActive: z.boolean(),
  version: z.number().int().nonnegative(),
});

export async function updateStaffRole(input: unknown): Promise<ActionResult<StaffAccount>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(updateStaffRoleSchema, input);
  if (!parsed.ok) return fail(parsed.error);

  const { data, error } = await staff.supabase.rpc("update_staff_role", {
    p_clerk_user_id: parsed.data.clerkUserId,
    p_role: parsed.data.role,
    p_is_active: parsed.data.isActive,
    p_version: parsed.data.version,
  });

  if (error) {
    return fail(
      describeDatabaseError(error, { action: "updateStaffRole", distinctId: staff.staffId }),
    );
  }

  captureStaffEvent(staff.staffId, "staff_role_changed", {
    target_clerk_user_id: parsed.data.clerkUserId,
    role: parsed.data.role,
    is_active: parsed.data.isActive,
  });

  return ok({
    clerkUserId: data.clerk_user_id,
    displayName: data.display_name,
    email: data.email,
    role: data.role as StaffAccount["role"],
    isActive: data.is_active,
    lastSignedInAt: data.last_signed_in_at,
    version: data.version,
  });
}

/**
 * `/staff/admin/users`'s own refetch, after a write or a stale version. The
 * page holds no live subscription; this is how it corrects itself. Mirrors
 * `refreshOwnerSettings` in `lib/schedule/actions.ts`.
 */
export async function refreshAllStaff(): Promise<ActionResult<StaffAccount[]>> {
  return getAllStaff();
}
