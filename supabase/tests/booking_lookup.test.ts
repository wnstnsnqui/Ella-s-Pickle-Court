import { describe, expect, it } from "vitest";

import { LOOKUP_DAYS_AFTER_LAST_SLOT } from "../../lib/booking/constants";
import { CLIENT_HASH_RETENTION_DAYS } from "../../lib/legal/constants";
import { asAuthenticated, query, rollback } from "./db";
import { asOnlineBooking, hold, PICK_SLOTS, uploadProof } from "./online_booking";

/**
 * Spec 0017: `lookup_online_booking` as the linked database runs it. A real
 * submitted booking is found with its contact masked; every other state reads
 * as the spec's table says; wrong codes are counted and limited; and nothing
 * but the `booking_lookup` role can run it.
 *
 * Opt in, like every test in this folder. Every case rolls back, and each
 * speaks under its own client hash so no case's misses count against another.
 */

const MINE = "00000000-0000-4000-8000-00000000e001";
const ago = (days: number) => `now() - interval '${days} days'`;

/** Speak as the minted `booking_lookup` token until `reset role`. */
function asBookingLookup(clientHash: string): string {
  const claims = JSON.stringify({ role: "booking_lookup", client_hash: clientHash });
  return `set local role booking_lookup;
select set_config('request.jwt.claims', '${claims}', true);`;
}

/** A lookup, its answer kept in `test.<key>` so it survives `reset role`. */
function look(key: string, code: string): string {
  return `select set_config('test.${key}', public.lookup_online_booking(${code})::text, true);`;
}

const answer = (key: string) => `current_setting('test.${key}')::jsonb`;

/** A booking whose rows are cancelled (outside `reservation_no_overlap`), its last slot ending `endedDaysAgo`. */
function seed({
  code,
  status,
  submitted = true,
  endedDaysAgo = -10,
  refund = "null",
}: {
  code: string;
  status: string;
  submitted?: boolean;
  endedDaysAgo?: number;
  refund?: "null" | "'owed'";
}) {
  return `with b as (
    insert into public.booking (code, status, customer_name, customer_phone, customer_email,
      reference_last4, amount, hourly_rate, hold_expires_at, terms_version, terms_accepted_at,
      submission_id, client_hash, submitted_at, refund_status)
    values ('${code}', '${status}', 'Lookup Test', '+639171234567', 'lookup@example.com',
      ${submitted ? "'1234'" : "null"}, 250, 250, now(), 'test', now(),
      gen_random_uuid(), 'lookup-seed', ${submitted ? "now()" : "null"}, ${refund})
    returning id
  )
  insert into public.reservation (court_id, kind, status, starts_at, ends_at, customer_name,
    payment_status, amount, booking_id, cancelled_at)
  select (select min(id) from public.court), 'booking', 'cancelled',
    ${ago(endedDaysAgo)} - interval '1 hour', ${ago(endedDaysAgo)},
    'Lookup Test', 'unpaid', 250, b.id, now()
  from b;`;
}

/** How many misses a client hash has. */
const misses = (hash: string) =>
  `(select count(*)::integer from public.booking_lookup_miss m where m.client_hash = '${hash}')`;

describe.skipIf(!process.env.DB_TESTS)(
  "lookup_online_booking on the linked database",
  { timeout: 60_000 },
  () => {
    it("finds a real submitted booking: Confirmed, masked, with court names and nothing else (AC-3, AC-4, AC-18)", async () => {
      const result = await query(
        rollback(`${PICK_SLOTS}
          ${asOnlineBooking()}
          ${hold("held", MINE, { name: "  Ana  Maria Reyes " })}
          reset role;
          ${uploadProof(MINE)}
          ${asOnlineBooking()}
          select public.submit_online_booking('${MINE}', '1234');
          reset role;
          ${asBookingLookup("lookup-found")}
          ${look("found", `${answer("held")} ->> 'code'`)}
          reset role;
          select ${answer("found")} ->> 'view' as view,
                 ${answer("found")} ->> 'first_name' as first_name,
                 ${answer("found")} ->> 'phone_last4' as phone_last4,
                 ${answer("found")} ->> 'email_masked' as email_masked,
                 jsonb_array_length(${answer("found")} -> 'runs') as runs,
                 (${answer("found")} -> 'runs' -> 0 ->> 'court_name') is not null as named,
                 (select array_agg(k order by k) from jsonb_object_keys(${answer("found")}) k) as keys,
                 ${misses("lookup-found")} as misses;`),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          {
            view: "confirmed",
            first_name: "Ana",
            phone_last4: "4567",
            email_masked: "t•••@example.com",
            runs: 2,
            named: true,
            keys: [
              "amount",
              "code",
              "email_masked",
              "first_name",
              "ok",
              "phone_last4",
              "reason",
              "refund_amount",
              "refund_status",
              "refunded_at",
              "runs",
              "submitted_at",
              "view",
            ],
            misses: 0,
          },
        ],
      });
    });

    it("answers an unknown code and an abandoned hold's code the same way, each a miss (AC-8)", async () => {
      const result = await query(
        rollback(`${seed({ code: "KTAB2345", status: "expired", submitted: false })}
          ${asBookingLookup("lookup-missing")}
          ${look("unknown", "'ZZZZ2345'")}
          ${look("abandoned", "'KTAB2345'")}
          reset role;
          select ${answer("unknown")} as unknown, ${answer("abandoned")} as abandoned,
                 ${misses("lookup-missing")} as misses;`),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          {
            unknown: { ok: false, reason: "not_found" },
            abandoned: { ok: false, reason: "not_found" },
            misses: 2,
          },
        ],
      });
    });

    it("reads Cancelled with the latest decision's reason code, never its note, and the refund (AC-5, AC-6)", async () => {
      const result = await query(
        rollback(`insert into public.staff (user_id, display_name, role, is_active)
            values ('lk_test_admin', 'Ana Admin', 'admin', true)
            on conflict (user_id) do nothing;
          ${seed({ code: "KTCA2345", status: "cancelled", refund: "'owed'" })}
          insert into public.booking_event (booking_id, kind, reason, note, refund_owed, staff_id, created_at)
          select b.id, 'rejected', 'no_payment', 'a private staff note', false, 'lk_test_admin', now() - interval '1 hour'
            from public.booking b where b.code = 'KTCA2345';
          insert into public.booking_event (booking_id, kind, reason, note, refund_owed, staff_id)
          select b.id, 'cancelled', 'venue_issue', 'another private note', true, 'lk_test_admin'
            from public.booking b where b.code = 'KTCA2345';
          ${asBookingLookup("lookup-cancelled")}
          ${look("found", "'KTCA2345'")}
          reset role;
          select ${answer("found")} ->> 'view' as view, ${answer("found")} ->> 'reason' as reason,
                 ${answer("found")} ->> 'refund_status' as refund,
                 position('private' in ${answer("found")}::text) as note_at;`),
      );
      expect(result).toEqual({
        ok: true,
        rows: [{ view: "cancelled", reason: "venue_issue", refund: "owed", note_at: 0 }],
      });
    });

    it("reads Not booked for a payment that arrived after the slots went (AC-7)", async () => {
      const result = await query(
        rollback(`${seed({ code: "KTNB2345", status: "expired", refund: "'owed'" })}
          ${asBookingLookup("lookup-not-booked")}
          ${look("found", "'KTNB2345'")}
          reset role;
          select ${answer("found")} ->> 'view' as view,
                 jsonb_array_length(${answer("found")} -> 'runs') as runs;`),
      );
      expect(result).toEqual({ ok: true, rows: [{ view: "not_booked", runs: 1 }] });
    });

    it(`answers ended ${LOOKUP_DAYS_AFTER_LAST_SLOT} days after the last slot, a day either side, and never counts it (AC-9, invariant 6)`, async () => {
      const result = await query(
        rollback(`${seed({ code: "KTEN2345", status: "confirmed", endedDaysAgo: LOOKUP_DAYS_AFTER_LAST_SLOT + 1 })}
          ${seed({ code: "KTEN2346", status: "confirmed", endedDaysAgo: LOOKUP_DAYS_AFTER_LAST_SLOT - 1 })}
          ${asBookingLookup("lookup-ended")}
          ${look("old", "'KTEN2345'")}
          ${look("recent", "'KTEN2346'")}
          reset role;
          select ${answer("old")} ->> 'reason' as old,
                 (${answer("old")} ->> 'ended_at')::timestamptz
                   = (select r.starts_at from public.reservation r join public.booking b on b.id = r.booking_id
                       where b.code = 'KTEN2345') as from_start,
                 ${answer("recent")} ->> 'view' as recent,
                 ${misses("lookup-ended")} as misses;`),
      );
      expect(result).toEqual({
        ok: true,
        rows: [{ old: "ended", from_start: true, recent: "confirmed", misses: 0 }],
      });
    });

    it("refuses every code after 5 misses in 15 minutes, a right one too, and stops counting (AC-10, invariant 2)", async () => {
      const result = await query(
        rollback(`${seed({ code: "KTRR2345", status: "confirmed" })}
          ${asBookingLookup("lookup-limited")}
          ${look("m1", "'ZZZZ2341'")}
          ${look("m2", "'ZZZZ2342'")}
          ${look("m3", "'ZZZZ2343'")}
          ${look("m4", "'ZZZZ2344'")}
          ${look("m5", "'ZZZZ2345'")}
          ${look("sixth", "'ZZZZ2346'")}
          ${look("right", "'KTRR2345'")}
          reset role;
          select ${answer("m5")} ->> 'reason' as fifth,
                 ${answer("sixth")} ->> 'reason' as sixth,
                 ${answer("right")} ->> 'reason' as right_code,
                 (${answer("right")} ->> 'retry_after_seconds')::integer between 1 and 900 as waits,
                 ${misses("lookup-limited")} as misses;`),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          {
            fifth: "not_found",
            sixth: "rate_limited",
            right_code: "rate_limited",
            waits: true,
            misses: 5,
          },
        ],
      });
    });

    it("never counts past 5 misses when 8 wrong codes arrive at once (AC-10, the lock)", async () => {
      // Separate connections, so these really run side by side. They cannot
      // roll back, so the case clears its own rows, before and after.
      const hash = "lookup-parallel-test";
      const clear = `delete from public.booking_lookup_miss where client_hash = '${hash}';`;
      await query(clear);
      try {
        const answers = await Promise.all(
          Array.from({ length: 8 }, (_, i) =>
            query(
              `begin; ${asBookingLookup(hash)} select public.lookup_online_booking('ZZZZ${2340 + i}') ->> 'reason' as reason; commit;`,
            ),
          ),
        );
        const reasons = answers.map((a) => (a.ok ? a.rows[0]?.reason : `error ${a.sqlstate}`));
        expect(reasons.filter((r) => r === "not_found")).toHaveLength(5);
        expect(reasons.filter((r) => r === "rate_limited")).toHaveLength(3);
        expect(await query(`select ${misses(hash)} as n;`)).toEqual({ ok: true, rows: [{ n: 5 }] });
      } finally {
        await query(clear);
      }
    });

    it("forgets misses older than 15 minutes for the limit", async () => {
      const result = await query(
        rollback(`insert into public.booking_lookup_miss (client_hash, created_at)
          select 'lookup-aged', now() - interval '16 minutes' from generate_series(1, 5);
          ${asBookingLookup("lookup-aged")}
          ${look("again", "'ZZZZ2349'")}
          reset role;
          select ${answer("again")} ->> 'reason' as reason;`),
      );
      expect(result).toEqual({ ok: true, rows: [{ reason: "not_found" }] });
    });

    it("refuses a call without the client_hash claim", async () => {
      const result = await query(
        rollback(`set local role booking_lookup;
          select set_config('request.jwt.claims', '{"role":"booking_lookup"}', true);
          select public.lookup_online_booking('ZZZZ2345');`),
      );
      expect(result).toMatchObject({ ok: false, sqlstate: "42501" });
    });

    it("refuses anon and a staff token on the function and on the miss table (AC-18)", async () => {
      for (const sql of [
        `set local role anon; select public.lookup_online_booking('ZZZZ2345');`,
        `set local role anon; select count(*) from public.booking_lookup_miss;`,
        asAuthenticated(
          { sub: "lk_test_admin" },
          `select public.lookup_online_booking('ZZZZ2345');`,
        ),
        asAuthenticated(
          { sub: "lk_test_admin" },
          `select count(*) from public.booking_lookup_miss;`,
        ),
      ]) {
        expect(await query(rollback(sql))).toMatchObject({ ok: false, sqlstate: "42501" });
      }
    });

    it("gives booking_lookup nothing but the one function (AC-18)", async () => {
      for (const sql of [
        `select count(*) from public.booking;`,
        `select count(*) from public.reservation;`,
        `select count(*) from public.booking_lookup_miss;`,
        `select public.hold_online_booking(gen_random_uuid(), current_date, '[]'::jsonb, 'a', '+639171234567', 'a@b.c', 't');`,
      ]) {
        expect(await query(rollback(`${asBookingLookup("lookup-grants")}\n${sql}`))).toMatchObject({
          ok: false,
          sqlstate: "42501",
        });
      }
    });

    it(`purges misses ${CLIENT_HASH_RETENTION_DAYS} day old, and keeps newer ones (AC-19)`, async () => {
      const result = await query(
        rollback(`insert into public.booking_lookup_miss (client_hash, created_at) values
            ('lookup-purge', now() - interval '${CLIENT_HASH_RETENTION_DAYS} days' - interval '1 hour'),
            ('lookup-purge', now() - interval '${CLIENT_HASH_RETENTION_DAYS} days' + interval '1 hour');
          select public.purge_online_booking_details();
          select ${misses("lookup-purge")} as left;`),
      );
      expect(result).toEqual({ ok: true, rows: [{ left: 1 }] });
    });
  },
);
