import { describe, expect, it } from "vitest";

import { asAuthenticated, query, rollback } from "./db";

/**
 * Spec 0012, AC-6 to AC-10: `public.update_staff_role()` as the linked
 * database actually runs it. Opt in like every test in this folder.
 *
 * Any real owner row is demoted to `admin` inside each test's own transaction
 * before a fake one is inserted, because `staff_single_owner_idx` allows only
 * one `owner` in the whole table at a time; the rollback at the end of every
 * case puts the real row straight back.
 *
 * Revised: owner carries the same power as superadmin here, so both
 * `sr_test_super` and `sr_test_owner` are exercised as callers.
 */

const SEED = `
  update public.staff set role = 'admin' where role = 'owner';
  insert into public.staff (clerk_user_id, display_name, role, is_active, version) values
    ('sr_test_super', 'SR Test Super', 'superadmin', true, 1),
    ('sr_test_owner', 'SR Test Owner', 'owner', true, 1),
    ('sr_test_target', 'SR Test Target', 'staff', true, 1)
  on conflict (clerk_user_id) do update
    set role = excluded.role, is_active = excluded.is_active, version = excluded.version;
`;

describe.skipIf(!process.env.DB_TESTS)(
  "update_staff_role on the linked database",
  { timeout: 60_000 },
  () => {
    it("refuses a caller acting on their own row (AC-7)", async () => {
      const result = await query(
        rollback(
          SEED +
            asAuthenticated(
              { sub: "sr_test_super" },
              "select public.update_staff_role('sr_test_super', 'admin', true, 1);",
            ),
        ),
      );
      expect(result).toMatchObject({ ok: false, sqlstate: "42501" });
    });

    it("refuses anyone who is not an active owner or superadmin (AC-6)", async () => {
      const result = await query(
        rollback(
          SEED +
            asAuthenticated(
              { sub: "sr_test_target" },
              "select public.update_staff_role('sr_test_owner', 'admin', true, 1);",
            ),
        ),
      );
      expect(result).toMatchObject({ ok: false, sqlstate: "42501" });
    });

    it("allows an owner, not just a superadmin, to change another account's role (AC-6, owner parity)", async () => {
      const result = await query(
        rollback(
          SEED +
            asAuthenticated(
              { sub: "sr_test_owner" },
              `select public.update_staff_role('sr_test_target', 'admin', true, 1);
               reset role;
               select role, version from public.staff where clerk_user_id = 'sr_test_target';`,
            ),
        ),
      );
      expect(result).toEqual({ ok: true, rows: [{ role: "admin", version: 2 }] });
    });

    it("raises stale_version (P0002) when the version does not match (AC-8)", async () => {
      const result = await query(
        rollback(
          SEED +
            asAuthenticated(
              { sub: "sr_test_super" },
              "select public.update_staff_role('sr_test_target', 'admin', true, 999);",
            ),
        ),
      );
      expect(result).toMatchObject({ ok: false, sqlstate: "P0002" });
    });

    it("raises stale_version (P0002) for a target that does not exist", async () => {
      const result = await query(
        rollback(
          SEED +
            asAuthenticated(
              { sub: "sr_test_super" },
              "select public.update_staff_role('sr_test_ghost', 'admin', true, 1);",
            ),
        ),
      );
      expect(result).toMatchObject({ ok: false, sqlstate: "P0002" });
    });

    it("bumps the version and flips is_active on an ordinary change", async () => {
      const result = await query(
        rollback(
          SEED +
            asAuthenticated(
              { sub: "sr_test_super" },
              `select public.update_staff_role('sr_test_target', 'admin', false, 1);
               reset role;
               select role, is_active, version from public.staff where clerk_user_id = 'sr_test_target';`,
            ),
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [{ role: "admin", is_active: false, version: 2 }],
      });
    });

    it("lets the current owner transfer owner away from themselves, demoting their own row as a side effect, not a self lockout violation (AC-7, owner parity)", async () => {
      const result = await query(
        rollback(
          SEED +
            asAuthenticated(
              { sub: "sr_test_owner" },
              `select public.update_staff_role('sr_test_target', 'owner', true, 1);
               reset role;
               select clerk_user_id, role from public.staff
                 where clerk_user_id in ('sr_test_owner', 'sr_test_target')
                 order by clerk_user_id;`,
            ),
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          { clerk_user_id: "sr_test_owner", role: "admin" },
          { clerk_user_id: "sr_test_target", role: "owner" },
        ],
      });
    });

    it("demotes the previous owner in the same transaction as a transfer, and audits both rows (AC-9, AC-10)", async () => {
      const result = await query(
        rollback(
          SEED +
            asAuthenticated(
              { sub: "sr_test_super" },
              `select public.update_staff_role('sr_test_target', 'owner', true, 1);
               reset role;
               select clerk_user_id, role from public.staff
                 where clerk_user_id in ('sr_test_owner', 'sr_test_target')
                 order by clerk_user_id;`,
            ),
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          { clerk_user_id: "sr_test_owner", role: "admin" },
          { clerk_user_id: "sr_test_target", role: "owner" },
        ],
      });

      const audit = await query(
        rollback(
          SEED +
            asAuthenticated(
              { sub: "sr_test_super" },
              `select public.update_staff_role('sr_test_target', 'owner', true, 1);
               reset role;
               select staff_id, changed_by from public.staff_audit
                 where staff_id in ('sr_test_owner', 'sr_test_target')
                 order by staff_id;`,
            ),
        ),
      );
      expect(audit).toEqual({
        ok: true,
        rows: [
          { staff_id: "sr_test_owner", changed_by: "sr_test_super" },
          { staff_id: "sr_test_target", changed_by: "sr_test_super" },
        ],
      });
    });

    it("at most one row ever holds owner: the partial unique index refuses a second (AC-9, invariant 3)", async () => {
      const result = await query(
        rollback(
          SEED +
            `insert into public.staff (clerk_user_id, display_name, role, is_active, version)
             values ('sr_test_owner_2', 'SR Test Owner 2', 'admin', true, 1)
             on conflict (clerk_user_id) do update set role = excluded.role, version = excluded.version;
             update public.staff set role = 'owner' where clerk_user_id = 'sr_test_owner_2';`,
        ),
      );
      expect(result).toMatchObject({ ok: false, sqlstate: "23505" });
    });
  },
);
