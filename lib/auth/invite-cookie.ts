import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * How a link token travels from the invite page to Better Auth's
 * `user.create.before` hook. Spec 0004 (revised), AC-1.
 *
 * The hook sees only the request: it has no argument of ours. So the plain
 * token rides in a cookie named `staff_invite`, signed with
 * `BETTER_AUTH_SECRET`, as `token.signature`. It never reaches a browser:
 * `redeemInvite` builds the `cookie` header by hand for its server side call,
 * and that is the only place it is ever set.
 *
 * The signature is not what keeps an invite safe (the database's single use
 * claim is). It stops a forged cookie from costing a database round trip.
 */

export const INVITE_COOKIE_NAME = "staff_invite";

/** The sha256 hex the database stores and compares. The plain token never reaches it. */
export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sign(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("base64url");
}

/** `token.signature`, the cookie's value. */
export function signInviteCookie(token: string, secret: string): string {
  return `${token}.${sign(token, secret)}`;
}

/** The token back out of a cookie value, or null when the signature does not hold. */
export function verifyInviteCookie(
  value: string | null | undefined,
  secret: string,
): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const token = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(token, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return token;
}

/** The one cookie named `name` out of a raw `cookie` header, or null. */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}
