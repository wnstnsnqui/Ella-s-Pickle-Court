"use server";

import { APIError } from "better-auth/api";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { placeholderEmail } from "@/lib/auth/constants";
import { hashLinkToken, INVITE_COOKIE_NAME, signInviteCookie } from "@/lib/auth/invite-cookie";
import { claimStaffReset } from "@/lib/auth/pool";
import { redeemInviteSchema, resetPasswordSchema } from "@/lib/auth/schemas";
import { captureStaffEvent } from "@/lib/analytics/server";
import { authConfigured, serverEnv } from "@/lib/env";

/**
 * The two Server Actions that run before any session exists. Spec 0004
 * (revised), invariant 7a.
 *
 * They are the one named exception to the rule that every Server Action calls
 * `requireStaff()` first: the person redeeming an invite or resetting a
 * password has no session yet. Their gate is a link claimed atomically in
 * Postgres (`claim_staff_invite` inside the `user.create.before` hook, or
 * `claim_staff_reset` here), and they live together in this file so the
 * exception is visible in one place. Everything else about them is the usual
 * shape: Zod first, a typed result, analytics only after success.
 */

export type AuthActionResult =
  | { ok: true }
  | {
      ok: false;
      error: {
        kind: "invalid" | "invite_invalid" | "username_taken" | "failed";
        message: string;
        issues?: Record<string, string[]>;
      };
    };

const INVITE_INVALID: AuthActionResult = {
  ok: false,
  error: {
    kind: "invite_invalid",
    message: "This link has been used, revoked or has expired. Ask Ella for a new one.",
  },
};

const NOT_CONFIGURED: AuthActionResult = {
  ok: false,
  error: { kind: "failed", message: "Sign in is not set up on this server yet." },
};

function invalid(issues: Record<string, string[]>): AuthActionResult {
  return {
    ok: false,
    error: { kind: "invalid", message: "That request did not look right.", issues },
  };
}

function failed(message: string): AuthActionResult {
  return { ok: false, error: { kind: "failed", message } };
}

/**
 * Create the account an invite link allows, by username and password. AC-1.
 *
 * The token rides to the hook as the signed `staff_invite` cookie in a
 * `Headers` object built here by hand: a cookie staged on the response with
 * `cookies().set()` is not visible to a call made in the same request, and
 * the hook can only read what the request carries. `nextCookies()` then
 * copies the session cookie Better Auth sets onto the real response. The
 * email is the placeholder the gate insists on; nothing ever reads it.
 */
export async function redeemInvite(input: unknown): Promise<AuthActionResult> {
  if (!authConfigured) return NOT_CONFIGURED;
  const parsed = redeemInviteSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
  }
  const { token, name, username, password } = parsed.data;

  const headers = new Headers();
  headers.set(
    "cookie",
    `${INVITE_COOKIE_NAME}=${signInviteCookie(token, serverEnv().BETTER_AUTH_SECRET)}`,
  );

  let userId: string;
  try {
    const result = await auth.api.signUpEmail({
      body: { name, username, email: placeholderEmail(username), password },
      headers,
    });
    userId = result.user.id;
  } catch (error) {
    if (error instanceof APIError) {
      if (error.status === "FORBIDDEN") return INVITE_INVALID;
      // The username plugin answers a taken username with 400, and the
      // credential provider answers the placeholder email it implies with 422.
      if (error.status === "BAD_REQUEST" || error.status === "UNPROCESSABLE_ENTITY") {
        return {
          ok: false,
          error: {
            kind: "username_taken",
            message: "That username is taken. Choose another one.",
          },
        };
      }
    }
    console.error(`redeemInvite: ${String(error)}`);
    return failed("Could not create your account right now. Try again in a moment.");
  }

  captureStaffEvent(userId, "staff_invite_redeemed", { kind: "invite", method: "password" });
  return { ok: true };
}

/**
 * Set a new password from a reset link. AC-7.
 *
 * `claim_staff_reset` through the auth pool is the gate, and it is single
 * use: a Better Auth failure after the claim burns the link, and the owner
 * makes another. The write mirrors Better Auth's own reset route: hash with
 * its `scrypt`, create the credential account if the row is somehow missing
 * (an account made before this app had only passwords), else update it, then
 * delete every session so the old password signs nobody in anywhere.
 */
export async function resetPassword(input: unknown): Promise<AuthActionResult> {
  if (!authConfigured) return NOT_CONFIGURED;
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
  }
  const { token, password } = parsed.data;

  let userId: string | null;
  try {
    userId = await claimStaffReset(hashLinkToken(token));
  } catch (error) {
    console.error(`resetPassword: claim failed: ${String(error)}`);
    return failed("Could not check that link right now. Try again in a moment.");
  }
  if (!userId) return INVITE_INVALID;

  try {
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(password);
    if (await ctx.internalAdapter.findCredentialAccount(userId)) {
      await ctx.internalAdapter.updatePassword(userId, hash);
    } else {
      await ctx.internalAdapter.createAccount({
        userId,
        providerId: "credential",
        accountId: userId,
        password: hash,
      });
    }
    await ctx.internalAdapter.deleteUserSessions(userId);
  } catch (error) {
    console.error(`resetPassword: write failed: ${String(error)}`);
    return failed(
      "The link was accepted but the password could not be saved. Ask Ella for a new link.",
    );
  }

  captureStaffEvent(userId, "staff_password_changed", { source: "reset" });
  return { ok: true };
}
