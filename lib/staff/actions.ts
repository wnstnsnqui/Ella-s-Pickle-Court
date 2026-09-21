"use server";

import { randomBytes } from "node:crypto";

import { z } from "zod";

import {
  describeDatabaseError,
  fail,
  ok,
  parseInput,
  requireStaff,
  type ActionResult,
} from "@/lib/actions";
import { captureStaffEvent, reportFailure } from "@/lib/analytics/server";
import { auth } from "@/lib/auth";
import { hashLinkToken } from "@/lib/auth/invite-cookie";
import { serverEnv } from "@/lib/env";
import { staffRoleSchema } from "@/lib/schedule/schemas";
import { getAllStaff, getPendingInvites, type PendingInvite, type StaffAccount } from "@/lib/staff";

/**
 * The writes behind `/staff/admin/users`. Spec 0012, AC-4 and AC-5; spec
 * 0004 (revised), AC-3 and AC-8.
 *
 * `update_staff_role()` and `create_staff_invite()` are the enforcement
 * points: owner or superadmin only, each refusing what the screen also
 * hides. These wrappers are the Server Action boundary spec 0001 requires;
 * they add nothing the functions do not already check.
 */
const updateStaffRoleSchema = z.object({
  userId: z.string().min(1),
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
    p_user_id: parsed.data.userId,
    p_role: parsed.data.role,
    p_is_active: parsed.data.isActive,
    p_version: parsed.data.version,
  });

  if (error) {
    return fail(
      describeDatabaseError(error, { action: "updateStaffRole", distinctId: staff.staffId }),
    );
  }

  // AC-8: switching someone off ends their sessions at once, after the row
  // write has succeeded. A failure here is not surfaced (the row is already
  // inactive and every policy refuses its writes) but it is logged and
  // reported, so it reaches error tracking.
  if (!parsed.data.isActive) {
    try {
      await (await auth.$context).internalAdapter.deleteUserSessions(parsed.data.userId);
    } catch (revocationError) {
      console.error("staff: session revocation failed", revocationError);
      reportFailure(
        { message: String(revocationError) },
        { action: "updateStaffRole.deleteUserSessions", distinctId: staff.staffId },
      );
    }
  }

  captureStaffEvent(staff.staffId, "staff_role_changed", {
    target_user_id: parsed.data.userId,
    role: parsed.data.role,
    is_active: parsed.data.isActive,
  });

  return ok({
    userId: data.user_id,
    displayName: data.display_name,
    username: data.username,
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

export async function refreshPendingInvites(): Promise<ActionResult<PendingInvite[]>> {
  return getPendingInvites();
}

/**
 * Make a one time link. Spec 0004 (revised), AC-3.
 *
 * The plain token is 32 random bytes, made here, hashed here, and never
 * stored: the database holds the sha256 hex, and the only time the plain
 * value leaves the server is inside the URL this returns, once.
 */
const createStaffInviteSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("invite"), role: z.enum(["staff", "admin", "superadmin"]) }),
  z.object({ kind: z.literal("reset"), targetUserId: z.string().min(1) }),
]);

export type CreatedLink = { url: string; expiresAt: string };

export async function createStaffInvite(input: unknown): Promise<ActionResult<CreatedLink>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(createStaffInviteSchema, input);
  if (!parsed.ok) return fail(parsed.error);

  const token = randomBytes(32).toString("base64url");

  // Only the argument this kind uses is sent. JSON drops an undefined key
  // anyway, and PostgREST resolves the call because the function declares
  // null defaults for the two optional arguments.
  const { data, error } = await staff.supabase.rpc("create_staff_invite", {
    p_kind: parsed.data.kind,
    p_token_hash: hashLinkToken(token),
    ...(parsed.data.kind === "invite"
      ? { p_role: parsed.data.role }
      : { p_target_user_id: parsed.data.targetUserId }),
  });

  if (error) {
    // `22023` is the function refusing the request on its own terms (a
    // superadmin cap, a reset for yourself or for an inactive account), with
    // a message written for the screen.
    if (error.code === "22023") {
      return fail({ kind: "invalid", message: error.message, issues: {} });
    }
    return fail(
      describeDatabaseError(error, { action: "createStaffInvite", distinctId: staff.staffId }),
    );
  }

  captureStaffEvent(staff.staffId, "staff_invite_created", {
    kind: parsed.data.kind,
    role: parsed.data.kind === "invite" ? parsed.data.role : null,
  });

  const path = parsed.data.kind === "invite" ? `/sign-up/${token}` : `/reset/${token}`;
  return ok({ url: `${serverEnv().BETTER_AUTH_URL}${path}`, expiresAt: data.expires_at });
}

const revokeStaffInviteSchema = z.object({ id: z.uuid(), kind: z.enum(["invite", "reset"]) });

/** Revoke a pending link. Spec 0004 (revised), AC-3. */
export async function revokeStaffInvite(input: unknown): Promise<ActionResult<null>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = parseInput(revokeStaffInviteSchema, input);
  if (!parsed.ok) return fail(parsed.error);

  const { error } = await staff.supabase.rpc("revoke_staff_invite", { p_id: parsed.data.id });

  if (error) {
    return fail(
      describeDatabaseError(error, { action: "revokeStaffInvite", distinctId: staff.staffId }),
    );
  }

  captureStaffEvent(staff.staffId, "staff_invite_revoked", { kind: parsed.data.kind });
  return ok(null);
}
