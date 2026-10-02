import { describe, expect, it } from "vitest";

import { query, rollback } from "./db";

/**
 * Spec 0015, AC-15 and AC-16: how a hold ends, as the linked database runs it.
 * `release_online_booking` (the player closed the sheet) and
 * `expire_online_holds()` (the minute job) both end in `expired`, cancel the
 * rows with nobody's name on them, and leave `hold_expires_at` as it was.
 *
 * Opt in, like every test in this folder. Every case rolls back. Bookings are
 * seeded straight into the tables, far in the future so no real row overlaps,
 * because what is under test is how a hold ends, not how one is taken.
 */

const LIVE = "00000000-0000-4000-8000-00000000a001";
const LAPSED = "00000000-0000-4000-8000-00000000a002";
const SUBMITTED = "00000000-0000-4000-8000-00000000a003";

/** One booking and its one row, on the first live court, `days` from now at the same hour. */
function seed(submission: string, code: string, status: string, expires: string, days: number) {
  const submitted = status === "pending_check" ? "now()" : "null";
  return `with b as (
    insert into public.booking (code, status, customer_name, customer_phone, customer_email,
      amount, hourly_rate, hold_expires_at, terms_version, terms_accepted_at, submission_id,
      client_hash, submitted_at, proof_path)
    values ('${code}', '${status}', 'Hold Life Test', '+639171234567', 'test@example.com',
      250, 250, ${expires}, 'test', now(), '${submission}', 'hold-life-test', ${submitted}, null)
    returning id
  )
  insert into public.reservation (court_id, kind, status, starts_at, ends_at, customer_name,
    customer_phone, payment_status, amount, booking_id)
  select (select min(id) from public.court where retired_at is null), 'booking', 'active',
    date_trunc('hour', now()) + interval '${days} days',
    date_trunc('hour', now()) + interval '${days} days 1 hour',
    'Hold Life Test', '+639171234567', 'unpaid', 250, b.id
  from b;`;
}

/** Each seeded booking: its status, seconds from now to its expiry, and its row. */
const STATE = `select b.code, b.status, extract(epoch from b.hold_expires_at - now())::integer as expires_in,
    r.status as row_status, r.cancelled_by
  from public.booking b join public.reservation r on r.booking_id = b.id
  where b.client_hash = 'hold-life-test'
  order by b.code;`;

describe.skipIf(!process.env.DB_TESTS)(
  "the hold's life on the linked database",
  { timeout: 60_000 },
  () => {
    it("the minute job ends a lapsed hold and leaves a live one and a submitted one alone (AC-16)", async () => {
      const result = await query(
        rollback(
          `${seed(LAPSED, "HXPD2345", "held", "now() - interval '1 minute'", 3001)}
           ${seed(LIVE, "HXPD2346", "held", "now() + interval '4 minutes'", 3002)}
           ${seed(SUBMITTED, "HXPD2347", "pending_check", "now() - interval '1 minute'", 3003)}
           select public.expire_online_holds();
           ${STATE}`,
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          // Expired, the expiry untouched, the row cancelled by nobody.
          {
            code: "HXPD2345",
            status: "expired",
            expires_in: -60,
            row_status: "cancelled",
            cancelled_by: null,
          },
          {
            code: "HXPD2346",
            status: "held",
            expires_in: 240,
            row_status: "active",
            cancelled_by: null,
          },
          {
            code: "HXPD2347",
            status: "pending_check",
            expires_in: -60,
            row_status: "active",
            cancelled_by: null,
          },
        ],
      });
    });

    it("release ends a live hold once, as online_booking, and the second call finds nothing (AC-15)", async () => {
      const result = await query(
        rollback(
          `${seed(LIVE, "HXPD2346", "held", "now() + interval '4 minutes'", 3002)}
           set local role online_booking;
           select set_config('test.first', public.release_online_booking('${LIVE}')::text, true);
           select set_config('test.second', public.release_online_booking('${LIVE}')::text, true);
           reset role;
           select current_setting('test.first')::jsonb as first,
                  current_setting('test.second')::jsonb as second,
                  b.status, r.status as row_status, r.cancelled_by
             from public.booking b
             join public.reservation r on r.booking_id = b.id
            where b.submission_id = '${LIVE}';`,
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          {
            first: { ok: true, released: true },
            second: { ok: true, released: false },
            status: "expired",
            row_status: "cancelled",
            cancelled_by: null,
          },
        ],
      });
    });

    it("release leaves a submitted booking booked, so closing from the receipt frees nothing (AC-14, AC-15)", async () => {
      const result = await query(
        rollback(
          `${seed(SUBMITTED, "HXPD2347", "pending_check", "now() + interval '4 minutes'", 3003)}
           set local role online_booking;
           select set_config('test.answer', public.release_online_booking('${SUBMITTED}')::text, true);
           reset role;
           select current_setting('test.answer')::jsonb as answer, b.status, r.status as row_status
             from public.booking b
             join public.reservation r on r.booking_id = b.id
            where b.submission_id = '${SUBMITTED}';`,
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          { answer: { ok: true, released: false }, status: "pending_check", row_status: "active" },
        ],
      });
    });

    it.each(["anon", "authenticated"])(
      "refuses %s on release and on the minute job (AC-20)",
      async (role) => {
        const release = await query(
          rollback(`set local role ${role}; select public.release_online_booking('${LIVE}');`),
        );
        expect(release).toMatchObject({ ok: false, sqlstate: "42501" });

        const expire = await query(
          rollback(`set local role ${role}; select public.expire_online_holds();`),
        );
        expect(expire).toMatchObject({ ok: false, sqlstate: "42501" });
      },
    );
  },
);
