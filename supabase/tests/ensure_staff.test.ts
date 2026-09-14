import { describe, expect, it } from "vitest";

import { asAuthenticated, query, rollback } from "./db";

/**
 * Spec 0004, AC-3, AC-5 and AC-6: `public.ensure_staff()` as the linked
 * database actually runs it.
 *
 * Opt in, because it needs the Supabase CLI logged in and linked, and a network
 * round trip per case: `npm run test:db`. The harness is in `db.ts`; every case
 * rolls back, including the one that empties the table to reach the owner
 * bootstrap rule.
 *
 * What this cannot prove: two first sign ins committing at the same moment. Both
 * batches here roll back, so neither would see the other's row. The case that
 * checks the advisory lock is held after a first sign in is the stand in.
 */

const HELD_ADVISORY_LOCKS =
  "select count(*)::int as locks from pg_locks where locktype = 'advisory' and pid = pg_backend_pid();";

// Each case is a CLI round trip to the linked project, so the default timeout is too short.
describe.skipIf(!process.env.DB_TESTS)(
  "ensure_staff on the linked database",
  { timeout: 60_000 },
  () => {
    it("cannot be called by anon (AC-6)", async () => {
      const result = await query(
        rollback("set local role anon; select * from public.ensure_staff();"),
      );
      expect(result).toMatchObject({ ok: false, sqlstate: "42501" });
    });

    it("leaves anon no way to insert a staff row (AC-6)", async () => {
      const result = await query(
        rollback(
          "set local role anon; insert into public.staff (clerk_user_id, display_name) values ('x', 'x');",
        ),
      );
      expect(result).toMatchObject({ ok: false, sqlstate: "42501" });
    });

    it("takes no parameters, so the caller cannot pass a role or an active flag (AC-3)", async () => {
      const result = await query(
        rollback(asAuthenticated({ sub: "probe" }, "select * from public.ensure_staff('owner');")),
      );
      expect(result).toMatchObject({ ok: false, sqlstate: "42883" });
    });

    it("refuses a token with no sub (AC-6)", async () => {
      const result = await query(
        rollback(asAuthenticated({}, "select * from public.ensure_staff();")),
      );
      expect(result).toMatchObject({
        ok: false,
        sqlstate: "42501",
        message: "ensure_staff needs a signed in caller",
      });
    });

    it("refuses a token with neither name nor email, naming the Clerk setting (AC-3, AC-8)", async () => {
      const result = await query(
        rollback(asAuthenticated({ sub: "probe" }, "select * from public.ensure_staff();")),
      );
      expect(result).toMatchObject({
        ok: false,
        sqlstate: "23514",
        message: "the session token carries no name or email; check the Clerk session token claims",
      });
    });

    it("makes the very first row the owner, under the bootstrap lock (AC-3)", async () => {
      const result = await query(
        rollback(
          "delete from public.staff;\n" +
            asAuthenticated(
              { sub: "user_first", name: "First Person", email: "first@example.com" },
              `select * from public.ensure_staff();
             reset role;
             select s.role, s.is_active, l.locks
               from public.staff s, (${HELD_ADVISORY_LOCKS.replace(";", "")}) l
              where s.clerk_user_id = 'user_first';`,
            ),
        ),
      );
      expect(result).toEqual({ ok: true, rows: [{ role: "owner", is_active: true, locks: 1 }] });
    });

    it("makes every later row staff, from the trimmed name and the email on the token (AC-3)", async () => {
      const result = await query(
        rollback(
          asAuthenticated(
            { sub: "user_probe", name: "  Probe Person  ", email: "probe@example.com" },
            `select * from public.ensure_staff();
           reset role;
           select display_name, email, role, is_active, last_signed_in_at is not null as stamped
             from public.staff where clerk_user_id = 'user_probe';`,
          ),
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          {
            display_name: "Probe Person",
            email: "probe@example.com",
            role: "staff",
            is_active: true,
            stamped: true,
          },
        ],
      });
    });

    it("falls back to the email when the name is blank, and cuts the name to 80 (AC-3)", async () => {
      const blank = await query(
        rollback(
          asAuthenticated(
            { sub: "user_blank", name: "   ", email: "blank@example.com" },
            "select display_name from public.ensure_staff();",
          ),
        ),
      );
      expect(blank).toEqual({ ok: true, rows: [{ display_name: "blank@example.com" }] });

      const long = await query(
        rollback(
          asAuthenticated(
            { sub: "user_long", name: "x".repeat(120), email: "long@example.com" },
            "select length(display_name) as len from public.ensure_staff();",
          ),
        ),
      );
      expect(long).toEqual({ ok: true, rows: [{ len: 80 }] });
    });

    it("refreshes name and email on a later call without touching role or is_active, and takes no lock (AC-3, AC-5)", async () => {
      const result = await query(
        rollback(
          // A row that already exists, switched off and made owner by SQL, as an owner would.
          `insert into public.staff (clerk_user_id, display_name, role, is_active)
           values ('user_again', 'Old Name', 'owner', false);
         ` +
            asAuthenticated(
              { sub: "user_again", name: "New Name", email: "again@example.com" },
              `select * from public.ensure_staff();
             reset role;
             select s.display_name, s.email, s.role, s.is_active, l.locks
               from public.staff s, (${HELD_ADVISORY_LOCKS.replace(";", "")}) l
              where s.clerk_user_id = 'user_again';`,
            ),
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          {
            display_name: "New Name",
            email: "again@example.com",
            role: "owner",
            is_active: false,
            locks: 0,
          },
        ],
      });
    });

    it("returns the row an inactive person can read, so the app can show the switched off notice (AC-5)", async () => {
      const result = await query(
        rollback(
          `insert into public.staff (clerk_user_id, display_name, is_active)
           values ('user_off', 'Switched Off', false);
         ` +
            asAuthenticated(
              { sub: "user_off", name: "Switched Off", email: "off@example.com" },
              "select * from public.ensure_staff();",
            ),
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [{ display_name: "Switched Off", role: "staff", is_active: false }],
      });
    });
  },
);
