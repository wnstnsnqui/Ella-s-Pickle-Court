import { describe, expect, it } from "vitest";

import { asAuthenticated, query, rollback } from "./db";

/**
 * Spec 0008 regression: `court_usage` must be `security definer`.
 *
 * `authenticated` has no `usage` on schema `private`, so a `security invoker`
 * function calling `private.is_owner()` directly failed for every caller,
 * owner included, with `permission denied for schema private` before the
 * owner check ever ran (found live by `/check verify`, fixed in
 * `20260915130000_court_usage_security_definer.sql`). This pins both halves:
 * an owner gets rows, a non owner gets the function's own `42501`, not a raw
 * schema permission error.
 */

const OWNER_SUB_QUERY =
  "select clerk_user_id from public.staff where role = 'owner' and is_active limit 1;";
const STAFF_SUB_QUERY =
  "select clerk_user_id from public.staff where role = 'staff' and is_active limit 1;";

describe.skipIf(!process.env.DB_TESTS)(
  "court_usage on the linked database",
  { timeout: 60_000 },
  () => {
    it("lets an active owner read usage rows", async () => {
      const who = await query(OWNER_SUB_QUERY);
      if (!who.ok || who.rows.length === 0)
        throw new Error("the linked project has no active owner row");
      const sub = String(who.rows[0].clerk_user_id);

      const result = await query(
        rollback(
          asAuthenticated(
            { sub },
            "select count(*)::int as n from public.court_usage('2020-01-01', '2020-01-01', null);",
          ),
        ),
      );
      expect(result).toMatchObject({ ok: true });
    });

    it("refuses a non owner with the function's own 42501, not a schema permission error", async () => {
      const who = await query(STAFF_SUB_QUERY);
      if (!who.ok || who.rows.length === 0)
        throw new Error("the linked project has no active staff row");
      const sub = String(who.rows[0].clerk_user_id);

      const result = await query(
        rollback(
          asAuthenticated(
            { sub },
            "select * from public.court_usage('2020-01-01', '2020-01-01', null);",
          ),
        ),
      );
      expect(result).toMatchObject({ ok: false, sqlstate: "42501" });
      if (result.ok) return;
      expect(result.message).toContain("Only an owner may read court usage.");
    });

    it("keeps anon away from it entirely", async () => {
      const result = await query(
        rollback(
          "set local role anon; select * from public.court_usage('2020-01-01', '2020-01-01', null);",
        ),
      );
      expect(result).toMatchObject({ ok: false, sqlstate: "42501" });
    });
  },
);
