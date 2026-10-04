import "server-only";

import { SignJWT } from "jose";
import { cache } from "react";

/**
 * The bridge between Better Auth and Supabase. Spec 0004 (revised), AC-6.
 *
 * Supabase's policies read `auth.jwt() ->> 'sub'`. Better Auth issues no JWT,
 * so this module mints one: a five minute HS256 token signed with the
 * project's legacy JWT secret, carrying the confirmed session's user id as
 * `sub`. `staffSupabase()` sends it, and every policy, `security definer`
 * function and `changed_by` value works exactly as it did before the move.
 *
 * Invariant 6: this is the only module that reads `SUPABASE_JWT_SECRET`
 * (`lib/import-boundaries.test.ts` pins that), and it mints exactly three fixed
 * token shapes: the staff token below (`role: "authenticated"`, five minutes),
 * the online booking token (`role: "online_booking"`, one minute, spec 0015),
 * and the booking lookup token (`role: "booking_lookup"`, one minute, spec
 * 0017). It exports no way to mint anything else. The secret can sign a
 * `service_role` token too, which is exactly why it is confined to this file.
 */

/** How long a minted token lives. Well past one request, well short of a shift. */
export const STAFF_TOKEN_LIFETIME_SECONDS = 5 * 60;

export type StaffTokenSubject = {
  id: string;
  /** Null only for an account that predates usernames and has not signed in since the backfill. */
  username: string | null;
  name: string;
};

function secretKey(): Uint8Array {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error("SUPABASE_JWT_SECRET is missing (the project's legacy JWT secret).");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Mint the token for this request's signed in person. Wrapped in React
 * `cache()` so a request signs once however many reads it makes; the cache
 * is keyed on the subject object, which `staffSupabase()` builds once per
 * request from the session.
 */
export const mintStaffToken = cache(async (subject: StaffTokenSubject): Promise<string> => {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({
    role: "authenticated",
    username: subject.username,
    name: subject.name,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(subject.id)
    .setAudience("authenticated")
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + STAFF_TOKEN_LIFETIME_SECONDS)
    .sign(secretKey());
});

/** How long an online booking token lives: one Server Action, with room to spare. */
export const ONLINE_BOOKING_TOKEN_LIFETIME_SECONDS = 60;

/**
 * Mint the token a public checkout write runs under. Spec 0015, the Decision.
 *
 * `role: "online_booking"` may run the online booking functions and write one
 * proof object per booking, and nothing else. There is no `sub`: the caller is
 * nobody, and no staff policy can match it. The `client_hash` claim is what
 * `hold_online_booking` counts for its rate limit. Only `lib/booking/actions.ts`
 * calls this, after its own checks; `lib/import-boundaries.test.ts` pins that.
 */
export async function mintOnlineBookingToken(clientHash: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: "online_booking", client_hash: clientHash })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ONLINE_BOOKING_TOKEN_LIFETIME_SECONDS)
    .sign(secretKey());
}

/** How long a booking lookup token lives: one Server Action, with room to spare. */
export const BOOKING_LOOKUP_TOKEN_LIFETIME_SECONDS = 60;

/**
 * Mint the token a public booking lookup runs under. Spec 0017, the Decision.
 *
 * `role: "booking_lookup"` may run `lookup_online_booking` and nothing else.
 * No `sub`, like the online booking token: the caller is nobody. The
 * `client_hash` claim is what the function counts wrong codes against. Only
 * `lib/booking/actions.ts` calls this; `lib/import-boundaries.test.ts` pins that.
 */
export async function mintBookingLookupToken(clientHash: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: "booking_lookup", client_hash: clientHash })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + BOOKING_LOOKUP_TOKEN_LIFETIME_SECONDS)
    .sign(secretKey());
}
