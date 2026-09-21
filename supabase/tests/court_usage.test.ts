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
 * an owner grade caller gets rows, a non owner gets the function's own
 * `42501`, not a raw schema permission error.
 *
 * Each case seeds its own caller inside the rolled back batch rather than
 * reading whatever rows the linked project holds: the Better Auth migration
 * emptied the table, and `staff_single_owner_idx` (spec 0012) allows one
 * owner, so the positive case seeds `admin`, which `private.is_owner()`
 * treats the same as `owner` (spec 0012 parity).
 */

describe.skipIf(!process.env.DB_TESTS)(
  "court_usage on the linked database",
  { timeout: 60_000 },
  () => {
    it("lets an active owner grade caller read usage rows", async () => {
      const result = await query(
        rollback(
          `insert into public.staff (user_id, display_name, role) values ('usage_test_admin', 'Usage Test Admin', 'admin');
           ` +
            asAuthenticated(
              { sub: "usage_test_admin" },
              "select count(*)::int as n from public.court_usage('2020-01-01', '2020-01-01', null);",
            ),
        ),
      );
      expect(result).toMatchObject({ ok: true });
    });

    it("refuses a non owner with the function's own 42501, not a schema permission error", async () => {
      const result = await query(
        rollback(
          `insert into public.staff (user_id, display_name, role) values ('usage_test_staff', 'Usage Test Staff', 'staff');
           ` +
            asAuthenticated(
              { sub: "usage_test_staff" },
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
