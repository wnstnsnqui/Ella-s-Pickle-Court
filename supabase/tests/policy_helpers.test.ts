import { describe, expect, it } from "vitest";

import { asAuthenticated, query, rollback } from "./db";

/**
 * Spec 0002: the row level security policies actually admit an active staff
 * member. Every policy on the four tables calls `private.is_active_staff()`
 * or `private.is_owner()` as the caller, so `authenticated` needs execute on
 * both, while `anon` must keep none of it. The first migration revoked it from
 * everyone and every signed in read failed with `42501`; this pins the grant.
 */

const STAFF_SUB_QUERY = "select user_id from public.staff where is_active limit 1;";

describe.skipIf(!process.env.DB_TESTS)(
  "policy helpers on the linked database",
  { timeout: 60_000 },
  () => {
    it("lets an active staff member read every table through the policies", async () => {
      const who = await query(STAFF_SUB_QUERY);
      if (!who.ok || who.rows.length === 0)
        throw new Error("the linked project has no active staff row");
      const sub = String(who.rows[0].user_id);

      const result = await query(
        rollback(
          asAuthenticated(
            { sub },
            `select (select count(*) from public.staff)::int as staff,
                    (select count(*) from public.court)::int as courts,
                    (select count(*) from public.reservation)::int as reservations,
                    (select count(*) from public.venue_settings)::int as settings;`,
          ),
        ),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.rows[0]).toMatchObject({ settings: 1 });
      expect(Number(result.rows[0].staff)).toBeGreaterThan(0);
    });

    it("keeps anon away from the helpers and the private schema", async () => {
      const direct = await query(
        rollback("set local role anon; select private.is_active_staff();"),
      );
      expect(direct).toMatchObject({ ok: false, sqlstate: "42501" });
    });

    it("still refuses a signed in caller who is not staff", async () => {
      const result = await query(
        rollback(
          asAuthenticated({ sub: "nobody" }, "select count(*)::int as n from public.staff;"),
        ),
      );
      expect(result).toEqual({ ok: true, rows: [{ n: 0 }] });
    });
  },
);
