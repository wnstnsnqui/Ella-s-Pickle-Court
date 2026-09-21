import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import { auth } from "@/lib/auth";
import { authConfigured } from "@/lib/env";
import type { StaffTokenSubject } from "@/lib/supabase/staff-token";

/**
 * The one session read per request. Spec 0004 (revised).
 *
 * `currentStaff()`, `requireStaff()`, `staffSupabase()` and the analytics
 * identify all want the same answer, so it is read once through React
 * `cache()`. With no configuration (development before `.env.local` is
 * filled) nobody is ever signed in.
 *
 * A Better Auth failure here (Postgres unreachable, a malformed cookie) is
 * logged and read as signed out: the public board must render whatever the
 * state of the auth database (AC-15), and a staff page then sends the person
 * to sign in, where the real error is shown.
 */
export const currentSession = cache(async () => {
  if (!authConfigured) return null;
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch (error) {
    console.error(`auth: could not read the session: ${String(error)}`);
    return null;
  }
});

/**
 * The signed in person as `mintStaffToken()` wants them, or null. Cached so
 * the same object reaches `mintStaffToken()` every time in a request, which
 * is what lets its own `cache()` sign once.
 */
export const currentSubject = cache(async (): Promise<StaffTokenSubject | null> => {
  const session = await currentSession();
  if (!session) return null;
  const { id, username, name } = session.user;
  return { id, username: username ?? null, name };
});
