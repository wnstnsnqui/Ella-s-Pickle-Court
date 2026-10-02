import { describe, expect, it } from "vitest";

import { query, rollback } from "./db";
import { asOnlineBooking, hold, PICK_SLOTS, TEST_CLIENT_HASH } from "./online_booking";

/**
 * Spec 0015, AC-4 to AC-7, AC-17 to AC-20: `hold_online_booking` as the linked
 * database runs it. Every rule that matters lives in this one function (the
 * slots, the hours, the price, the code, the rate limit), so a caller who skips
 * the app meets all of them here.
 *
 * Opt in, like every test in this folder. Every case rolls back.
 */

const FIRST = "00000000-0000-4000-8000-00000000b001";
const SECOND = "00000000-0000-4000-8000-00000000b002";

/** The booking and its rows, as the database stored them. */
const STORED = `
select b.status, b.code, b.customer_name, b.customer_phone, b.amount::float as amount,
       b.hourly_rate::float as hourly_rate, b.client_hash, b.terms_version,
       b.proof_path = b.id || '/' || b.submission_id as proof_path_issued,
       extract(epoch from b.hold_expires_at - now())::integer as expires_in,
       (select json_agg(json_build_object(
                'court', case r.court_id when current_setting('test.court1')::bigint then 1 else 2 end,
                'tiles', extract(epoch from r.ends_at - r.starts_at)::integer / 60 / s.slot_minutes,
                'amount', r.amount::float, 'name', r.customer_name, 'created_by', r.created_by,
                'status', r.status)
              order by r.court_id)
          from public.reservation r where r.booking_id = b.id) as runs
  from public.booking b, public.venue_settings s
 where b.submission_id = '${FIRST}' and s.id`;

describe.skipIf(!process.env.DB_TESTS)(
  "hold_online_booking on the linked database",
  { timeout: 60_000 },
  () => {
    it("holds every pick in one booking: a code, a 5 minute expiry, one row per run, the price worked out here (AC-4, AC-17, AC-18)", async () => {
      const result = await query(
        rollback(`${PICK_SLOTS}
          ${asOnlineBooking()}
          ${hold("answer", FIRST)}
          reset role;
          select current_setting('test.answer')::jsonb ->> 'ok' as ok, s.slot_minutes, stored.*
            from public.venue_settings s, (${STORED}) stored
           where s.id;`),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const [row] = result.rows as [Record<string, unknown>];
      const hours = (3 * Number(row.slot_minutes)) / 60;

      expect(row).toMatchObject({
        ok: "true",
        status: "held",
        customer_phone: "+639171234567",
        client_hash: TEST_CLIENT_HASH,
        terms_version: "test",
        proof_path_issued: true,
        expires_in: 300,
      });
      // AC-18: 8 characters from the unambiguous alphabet, stored without the dash.
      expect(row.code).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
      // AC-17: tiles times hours times the rate, read now; the client sent no price.
      expect(row.amount).toBe(hours * Number(row.hourly_rate));
      // AC-4: two adjacent picks on court 1 are one row, court 2's pick is another,
      // nobody's name is on them, and the shares add up to the booking's amount.
      const runs = row.runs as { court: number; tiles: number; amount: number }[];
      expect(runs).toMatchObject([
        { court: 1, tiles: 2, name: "Checkout Test", created_by: null, status: "active" },
        { court: 2, tiles: 1, name: "Checkout Test", created_by: null, status: "active" },
      ]);
      expect(runs.reduce((sum, run) => sum + run.amount, 0)).toBe(row.amount);
    });

    it("the same sheet holding again edits the details in place: same code, same expiry (AC-5)", async () => {
      const result = await query(
        rollback(`${PICK_SLOTS}
          ${asOnlineBooking()}
          ${hold("first", FIRST)}
          ${hold("again", FIRST, { name: "Edited Name", phone: "+639181112222" })}
          reset role;
          select (current_setting('test.first')::jsonb ->> 'code') = (current_setting('test.again')::jsonb ->> 'code') as same_code,
                 (current_setting('test.first')::jsonb ->> 'hold_expires_at') = (current_setting('test.again')::jsonb ->> 'hold_expires_at') as same_expiry,
                 (select count(*) from public.booking where submission_id = '${FIRST}')::integer as bookings,
                 (select customer_name from public.booking where submission_id = '${FIRST}') as name,
                 (select array_agg(distinct r.customer_phone) from public.reservation r
                    join public.booking b on b.id = r.booking_id where b.submission_id = '${FIRST}') as row_phones;`),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          {
            same_code: true,
            same_expiry: true,
            bookings: 1,
            name: "Edited Name",
            row_phones: ["+639181112222"],
          },
        ],
      });
    });

    it("refuses a slot somebody already holds, names it, and writes nothing (AC-6)", async () => {
      const result = await query(
        rollback(`${PICK_SLOTS}
          ${asOnlineBooking()}
          ${hold("first", FIRST, { picks: "jsonb_build_array(current_setting('test.picks')::jsonb -> 2)" })}
          ${hold("second", SECOND)}
          reset role;
          select current_setting('test.second')::jsonb ->> 'reason' as reason,
                 (current_setting('test.second')::jsonb -> 'slots' -> 0 ->> 'court_id')::bigint
                   = current_setting('test.court2')::bigint as names_court_2,
                 jsonb_array_length(current_setting('test.second')::jsonb -> 'slots') as taken,
                 (select count(*) from public.booking where submission_id = '${SECOND}')::integer as written;`),
      );
      expect(result).toEqual({
        ok: true,
        rows: [{ reason: "slot_taken", names_court_2: true, taken: 1, written: 0 }],
      });
    });

    it("frees a lapsed hold over the same slots before checking, so it never blocks a new one (AC-16)", async () => {
      const result = await query(
        rollback(`${PICK_SLOTS}
          ${asOnlineBooking()}
          ${hold("first", FIRST)}
          reset role;
          update public.booking set hold_expires_at = now() - interval '1 second'
           where submission_id = '${FIRST}';
          ${asOnlineBooking()}
          ${hold("second", SECOND)}
          reset role;
          select current_setting('test.second')::jsonb ->> 'ok' as second_ok,
                 (select status from public.booking where submission_id = '${FIRST}') as first_status;`),
      );
      expect(result).toEqual({ ok: true, rows: [{ second_ok: "true", first_status: "expired" }] });
    });

    it.each([
      ["a day in the past", { day: "current_date - 1" }],
      ["a day beyond the booking window", { day: "current_date + 400" }],
      [
        "a start off the slot grid",
        {
          picks: `jsonb_build_array(jsonb_build_object('court_id', current_setting('test.court1')::bigint,
                    'starts_at', current_setting('test.slot1')::timestamptz + interval '7 minutes'))`,
        },
      ],
      [
        "a start before the day opens",
        {
          picks: `jsonb_build_array(jsonb_build_object('court_id', current_setting('test.court1')::bigint,
                    'starts_at', current_setting('test.slot1')::timestamptz - interval '3 hours'))`,
        },
      ],
      [
        "a court that does not exist",
        {
          picks: `jsonb_build_array(jsonb_build_object('court_id', 999999,
                    'starts_at', current_setting('test.slot1')::timestamptz))`,
        },
      ],
    ])("refuses %s as out_of_range and writes nothing (AC-7)", async (_, options) => {
      const result = await query(
        rollback(`${PICK_SLOTS}
          ${asOnlineBooking()}
          ${hold("answer", FIRST, options)}
          reset role;
          select current_setting('test.answer')::jsonb as answer,
                 (select count(*) from public.booking where submission_id = '${FIRST}')::integer as written;`),
      );
      expect(result).toEqual({
        ok: true,
        rows: [{ answer: { ok: false, reason: "out_of_range" }, written: 0 }],
      });
    });

    it.each([
      ["a phone not in the stored form", { phone: "09171234567" }],
      ["an empty name", { name: "   " }],
    ])("refuses %s as invalid (AC-2, checked again in Postgres)", async (_, options) => {
      const result = await query(
        rollback(`${PICK_SLOTS}
          ${asOnlineBooking()}
          ${hold("answer", FIRST, options)}
          reset role;
          select current_setting('test.answer')::jsonb as answer;`),
      );
      expect(result).toEqual({ ok: true, rows: [{ answer: { ok: false, reason: "invalid" } }] });
    });

    it("refuses a sixth new hold from one client within 15 minutes, with the wait (AC-19)", async () => {
      const seeded = [1, 2, 3, 4, 5]
        .map(
          (n) => `insert into public.booking (code, status, customer_name, customer_phone,
              customer_email, amount, hourly_rate, hold_expires_at, terms_version, terms_accepted_at,
              submission_id, client_hash, created_at)
            values ('RQTESTX${n + 1}', 'expired', 'Rate Test', '+639171234567', 'test@example.com',
              250, 250, now(), 'test', now(), gen_random_uuid(), '${TEST_CLIENT_HASH}',
              now() - interval '${15 - n} minutes');`,
        )
        .join("\n");
      const result = await query(
        rollback(`${PICK_SLOTS}
          ${seeded}
          ${asOnlineBooking()}
          ${hold("limited", FIRST)}
          ${asOnlineBooking("online-booking-db-test-other")}
          ${hold("other", SECOND)}
          reset role;
          select current_setting('test.limited')::jsonb ->> 'reason' as reason,
                 (current_setting('test.limited')::jsonb ->> 'retry_after_seconds')::integer as retry_after,
                 current_setting('test.other')::jsonb ->> 'ok' as other_client_ok;`),
      );
      // The oldest of the five was made 14 minutes ago, so it ages out in about a minute.
      expect(result).toMatchObject({ ok: true, rows: [{ reason: "rate_limited" }] });
      if (!result.ok) return;
      const [row] = result.rows as [{ retry_after: number; other_client_ok: string }];
      expect(row.retry_after).toBeGreaterThanOrEqual(1);
      expect(row.retry_after).toBeLessThanOrEqual(60);
      // The limit is per client: another address is not held back.
      expect(row.other_client_ok).toBe("true");
    });

    it("refuses a token with no client hash, because the rate limit would have nothing to count (AC-19)", async () => {
      const result = await query(
        rollback(`${PICK_SLOTS}
          set local role online_booking;
          select set_config('request.jwt.claims', '{"role":"online_booking"}', true);
          ${hold("answer", FIRST)}`),
      );
      expect(result).toMatchObject({ ok: false, sqlstate: "42501" });
    });

    it.each(["anon", "authenticated"])(
      "refuses %s on the hold and on reading any booking (AC-20)",
      async (role) => {
        const call = await query(
          rollback(`${PICK_SLOTS}
            set local role ${role};
            ${hold("answer", FIRST)}`),
        );
        expect(call).toMatchObject({ ok: false, sqlstate: "42501" });

        if (role === "anon") {
          const read = await query(
            rollback(`set local role anon; select count(*) from public.booking;`),
          );
          expect(read).toMatchObject({ ok: false, sqlstate: "42501" });
        }
      },
    );

    it("gives online_booking no read of booking, and no read of a phone on the board (AC-20)", async () => {
      const booking = await query(
        rollback(`${asOnlineBooking()} select count(*) from public.booking;`),
      );
      expect(booking).toMatchObject({ ok: false, sqlstate: "42501" });

      const phone = await query(
        rollback(`${asOnlineBooking()} select customer_phone from public.reservation limit 1;`),
      );
      expect(phone).toMatchObject({ ok: false, sqlstate: "42501" });
    });
  },
);
