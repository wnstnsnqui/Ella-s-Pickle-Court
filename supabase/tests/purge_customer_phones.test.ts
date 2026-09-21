import { describe, expect, it } from "vitest";

import { PHONE_RETENTION_DAYS } from "../../lib/legal/constants";
import { query, rollback } from "./db";

/**
 * Spec 0010, AC-5, AC-6, AC-7, AC-8: `public.purge_customer_phones()` as the
 * linked database actually runs it.
 *
 * Opt in, like every test in this folder: needs the Supabase CLI logged in
 * and linked. Every case rolls back, including the ones that seed a booking.
 *
 * The seeded staff row is `staff`, not `owner`: `staff_single_owner_idx`
 * (spec 0012) allows one owner, so an `owner` seed under `on conflict do
 * nothing` silently vanishes whenever the project already has one, and the
 * booking's foreign key then fails. The purge itself never looks at the role.
 */

describe.skipIf(!process.env.DB_TESTS)(
  "purge_customer_phones on the linked database",
  { timeout: 60_000 },
  () => {
    it("clears the phone from the reservation and its newest audit row, bumps version once, and is idempotent (AC-5, AC-8)", async () => {
      const result = await query(
        rollback(
          `insert into public.staff (user_id, display_name, role) values ('purge_test_owner', 'Purge Test Owner', 'staff') on conflict do nothing;
           insert into public.reservation (court_id, kind, starts_at, ends_at, customer_name, customer_phone, created_by, changed_by)
           values (1, 'booking', now() - interval '91 days' - interval '1 hour', now() - interval '91 days', 'Purge Test Customer', '09171234567', 'purge_test_owner', 'purge_test_owner');
           select public.purge_customer_phones() as first_run_count;
           select public.purge_customer_phones() as second_run_count;
           select r.customer_phone, ra.old_row->>'customer_phone' as audit_old, ra.new_row->>'customer_phone' as audit_new, r.version, r.changed_by
             from public.reservation r
             join public.reservation_audit ra on ra.reservation_id = r.id
            where r.customer_name = 'Purge Test Customer'
            order by ra.changed_at desc limit 1;`,
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          {
            customer_phone: null,
            audit_old: null,
            audit_new: null,
            version: 2,
            changed_by: null,
          },
        ],
      });
    });

    it("leaves a booking with no phone, a recent booking, and a closure untouched (AC-5, AC-8)", async () => {
      const result = await query(
        rollback(
          `insert into public.staff (user_id, display_name, role) values ('purge_test_owner2', 'Purge Test Owner 2', 'staff') on conflict do nothing;
           insert into public.reservation (court_id, kind, starts_at, ends_at, customer_name, customer_phone, created_by, changed_by)
           values
             (1, 'booking', now() - interval '91 days' - interval '2 hours', now() - interval '91 days' - interval '1 hour', 'No Phone Customer', null, 'purge_test_owner2', 'purge_test_owner2'),
             (1, 'booking', now() - interval '10 days' - interval '1 hour', now() - interval '10 days', 'Recent Customer', '09170000000', 'purge_test_owner2', 'purge_test_owner2'),
             (2, 'closed', now() - interval '91 days' - interval '1 hour', now() - interval '91 days', null, null, 'purge_test_owner2', 'purge_test_owner2');
           select public.purge_customer_phones() as n;
           select customer_name, customer_phone, version
             from public.reservation
            where customer_name in ('No Phone Customer', 'Recent Customer') or (kind = 'closed' and created_by = 'purge_test_owner2')
            order by customer_name nulls last;`,
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          { customer_name: "No Phone Customer", customer_phone: null, version: 1 },
          { customer_name: "Recent Customer", customer_phone: "09170000000", version: 1 },
          { customer_name: null, customer_phone: null, version: 1 },
        ],
      });
    });

    it("cannot be called by anon or authenticated (AC-6)", async () => {
      const anon = await query(
        rollback("set local role anon; select public.purge_customer_phones();"),
      );
      expect(anon).toMatchObject({ ok: false, sqlstate: "42501" });

      const authenticated = await query(
        rollback("set local role authenticated; select public.purge_customer_phones();"),
      );
      expect(authenticated).toMatchObject({ ok: false, sqlstate: "42501" });
    });

    it("keeps the function's interval in step with PHONE_RETENTION_DAYS (AC-7)", async () => {
      const result = await query(
        "select pg_get_functiondef('public.purge_customer_phones'::regproc) as def;",
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const def = String(result.rows[0].def);
      expect(def).toContain(`interval '${PHONE_RETENTION_DAYS} days'`);
    });

    it("registers the nightly schedule at 19:00 UTC (AC-6)", async () => {
      const result = await query(
        "select jobname, schedule, active from cron.job where jobname = 'purge_customer_phones';",
      );
      expect(result).toEqual({
        ok: true,
        rows: [{ jobname: "purge_customer_phones", schedule: "0 19 * * *", active: true }],
      });
    });
  },
);
