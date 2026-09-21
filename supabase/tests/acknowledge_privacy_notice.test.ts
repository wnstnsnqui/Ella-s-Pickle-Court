import { describe, expect, it } from "vitest";

import { asAuthenticated, query, rollback } from "./db";

/**
 * Spec 0010, AC-9: `public.acknowledge_privacy_notice(version)` as the linked
 * database actually runs it. Opt in like every test in this folder.
 *
 * Every signed in claim set carries a `name`: the function calls
 * `ensure_staff()` first (the race fix of 2026-09-18), which refuses a token
 * with neither name nor username, exactly as `mintStaffToken()` always sends one.
 */

describe.skipIf(!process.env.DB_TESTS)(
  "acknowledge_privacy_notice on the linked database",
  { timeout: 60_000 },
  () => {
    it("records the caller's own row and returns the stored version (AC-9)", async () => {
      const result = await query(
        rollback(
          `insert into public.staff (user_id, display_name, role) values ('ack_test_staff', 'Ack Test Staff', 'staff') on conflict do nothing;
           ` +
            asAuthenticated(
              { sub: "ack_test_staff", name: "Ack Test Staff" },
              `select public.acknowledge_privacy_notice('2026-09-16') as returned;
             reset role;
             select privacy_acknowledged_version, privacy_acknowledged_at is not null as stamped
               from public.staff where user_id = 'ack_test_staff';`,
            ),
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [{ privacy_acknowledged_version: "2026-09-16", stamped: true }],
      });
    });

    it("refuses a signed out caller (AC-9)", async () => {
      const result = await query(
        rollback("select public.acknowledge_privacy_notice('2026-09-16');"),
      );
      expect(result).toMatchObject({ ok: false, sqlstate: "42501" });
    });

    it("creates the staff row first when the caller has none, so a first sign in cannot lose the race (AC-9)", async () => {
      const result = await query(
        rollback(
          asAuthenticated(
            { sub: "ack_test_ghost", name: "Ack Test Ghost" },
            `select public.acknowledge_privacy_notice('2026-09-16') as returned;
             reset role;
             select privacy_acknowledged_version from public.staff where user_id = 'ack_test_ghost';`,
          ),
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [{ privacy_acknowledged_version: "2026-09-16" }],
      });
    });

    it("cannot name another caller's row: two callers each hold only their own version (AC-9)", async () => {
      const result = await query(
        rollback(
          `insert into public.staff (user_id, display_name, role) values
             ('ack_test_a', 'Ack Test A', 'staff'),
             ('ack_test_b', 'Ack Test B', 'staff')
           on conflict do nothing;
           ` +
            asAuthenticated(
              { sub: "ack_test_a", name: "Ack Test A" },
              "select public.acknowledge_privacy_notice('2026-09-16');",
            ) +
            "\nreset role;\n" +
            `select user_id, privacy_acknowledged_version
               from public.staff where user_id in ('ack_test_a', 'ack_test_b')
              order by user_id;`,
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          { user_id: "ack_test_a", privacy_acknowledged_version: "2026-09-16" },
          { user_id: "ack_test_b", privacy_acknowledged_version: null },
        ],
      });
    });
  },
);
