import "server-only";

import { APIError } from "better-auth/api";

import { placeholderEmail, STAFF_ONLY_LINE } from "@/lib/auth/constants";
import {
  hashLinkToken,
  INVITE_COOKIE_NAME,
  readCookie,
  verifyInviteCookie,
} from "@/lib/auth/invite-cookie";
import { claimStaffInvite, countAuthUsers } from "@/lib/auth/pool";
import { authConfigured, serverEnv } from "@/lib/env";

/**
 * The gate inside Better Auth's `user.create.before` hook. Spec 0004
 * (revised), AC-1, AC-2, invariant 1.
 *
 * Every account has a username, and its email is the placeholder derived
 * from that username: a request carrying no username, or any other email, is
 * refused before anything else is looked at. Then: allowed when the request
 * carries a signed `staff_invite` cookie whose token claims a pending invite
 * for this username, or when this is the bootstrap: no user yet and the
 * username is `BOOTSTRAP_OWNER_USERNAME`. Anything else, including any error
 * from the pool, refuses with the fixed staff only line as a `FORBIDDEN` API
 * error. A link claimed by a call whose response was then lost is burnt; the
 * owner makes a new one (AC-15).
 *
 * Its own module, apart from `lib/auth.ts`, so it can be tested without
 * building a Better Auth instance.
 */

export function staffOnly(): APIError {
  return new APIError("FORBIDDEN", { message: STAFF_ONLY_LINE });
}

export async function allowUserCreation(
  user: { email: string; username?: string | null },
  cookieHeader: string | null | undefined,
): Promise<void> {
  if (!authConfigured) throw staffOnly();
  const env = serverEnv();

  const username = user.username?.trim().toLowerCase();
  if (!username || user.email.trim().toLowerCase() !== placeholderEmail(username)) {
    throw staffOnly();
  }

  const cookie = readCookie(cookieHeader, INVITE_COOKIE_NAME);
  const token = verifyInviteCookie(cookie, env.BETTER_AUTH_SECRET);
  if (token) {
    const role = await claimStaffInvite(hashLinkToken(token), username);
    if (role) return;
    throw staffOnly();
  }

  if (username === env.BOOTSTRAP_OWNER_USERNAME.trim().toLowerCase()) {
    // The unique constraint on better_auth."user".username settles a race
    // between two bootstrap requests; nothing here needs a lock.
    if ((await countAuthUsers()) === 0) return;
  }
  throw staffOnly();
}
