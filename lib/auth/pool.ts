import "server-only";

import { Pool } from "pg";

import { serverEnv } from "@/lib/env";

/**
 * The one connection pool Better Auth uses, and the only handle on the
 * `better_auth_app` role. Spec 0004 (revised), invariant 7.
 *
 * `better_auth_app` owns the `better_auth` schema and may execute exactly
 * three functions in `public`: `claim_staff_invite`, `claim_staff_reset` and
 * `peek_staff_invite`. Nothing else. So this pool is not a way around
 * `staffSupabase()`: it cannot read a court, a booking or a staff row. Only
 * `lib/auth.ts`, `lib/auth/actions.ts` and the three public auth pages may
 * import it; `lib/import-boundaries.test.ts` fails on any other importer.
 *
 * One pool per process, created on first use. `max: 3` because the URL points
 * at Supavisor in transaction mode on Vercel (spec 0004, Configuration), where
 * many small pools across many instances add up fast.
 */

let pool: Pool | undefined;

export function authPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: serverEnv().BETTER_AUTH_DATABASE_URL,
      max: 3,
      // Supabase's pooler and direct connection both present a certificate
      // signed by a public CA, so verification is left on.
    });
  }
  return pool;
}

/**
 * Better Auth's `user` count, for the bootstrap rule (spec 0004, AC-2). The
 * count is read through this role's own schema, where `search_path` already
 * points, so the table is named plainly.
 */
export async function countAuthUsers(): Promise<number> {
  const { rows } = await authPool().query<{ count: string }>(
    'select count(*)::text as count from better_auth."user"',
  );
  return Number(rows[0]?.count ?? "0");
}

/**
 * The three `public` functions this role may call, each wrapped so the
 * callers never write SQL. Every one takes the sha256 hex of a link token,
 * never the plain token.
 */

/** Claims a pending invite for `username`; returns its role, or null. */
export async function claimStaffInvite(
  tokenHash: string,
  username: string,
): Promise<string | null> {
  const { rows } = await authPool().query<{ claim_staff_invite: string | null }>(
    "select public.claim_staff_invite($1, $2)",
    [tokenHash, username],
  );
  return rows[0]?.claim_staff_invite ?? null;
}

/** Claims a pending reset link; returns the target user id, or null. */
export async function claimStaffReset(tokenHash: string): Promise<string | null> {
  const { rows } = await authPool().query<{ claim_staff_reset: string | null }>(
    "select public.claim_staff_reset($1)",
    [tokenHash],
  );
  return rows[0]?.claim_staff_reset ?? null;
}

export type PendingLink = { kind: "invite" } | { kind: "reset"; targetUsername: string | null };

/** What a pending link is, without claiming it; null when it is not pending. */
export async function peekStaffInvite(tokenHash: string): Promise<PendingLink | null> {
  const { rows } = await authPool().query<{ kind: string; target_username: string | null }>(
    "select kind, target_username from public.peek_staff_invite($1)",
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.kind === "reset") return { kind: "reset", targetUsername: row.target_username };
  return { kind: "invite" };
}
