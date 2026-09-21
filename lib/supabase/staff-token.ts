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
 * (`lib/import-boundaries.test.ts` pins that), every token it mints carries
 * `role: "authenticated"` and a five minute life, and it exports no way to
 * mint anything else. The secret can sign a `service_role` token too, which
 * is exactly why it is confined to these forty lines.
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
