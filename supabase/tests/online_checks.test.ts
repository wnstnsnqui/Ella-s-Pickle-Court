import { describe, expect, it } from "vitest";

import { asAuthenticated, query, rollback } from "./db";
import { asOnlineBooking, hold, PICK_SLOTS, uploadProof } from "./online_booking";

/**
 * Spec 0016: the staff check as the linked database runs it. The four
 * decision functions, the row guard trigger, the paid after hold trigger and
 * the retention rule, with every refusal in AC-15.
 *
 * Opt in, like every test in this folder. Every case rolls back. Each case
 * makes one real online booking through spec 0015's own functions (hold,
 * upload, submit), so it starts `pending_check` exactly as a player leaves it.
 */

const MINE = "00000000-0000-4000-8000-00000000d001";

const STAFF = `
insert into public.staff (user_id, display_name, role, is_active) values
  ('oc_test_admin', 'Ana Admin', 'admin', true),
  ('oc_test_staff', 'Sam Staff', 'staff', true)
on conflict (user_id) do update set role = excluded.role, is_active = excluded.is_active;`;

/** A booking waiting for its check; its id and version in `test.booking` and `test.version`. */
const PENDING = `${PICK_SLOTS}
${STAFF}
${asOnlineBooking()}
${hold("held", MINE)}
reset role;
${uploadProof(MINE)}
${asOnlineBooking()}
select public.submit_online_booking('${MINE}', '1234');
reset role;
${remember()}`;

/** Keep the booking's id and current version where every role can read them. */
function remember(): string {
  return `select set_config('test.booking', b.id::text, true),
       set_config('test.version', b.version::text, true)
  from public.booking b where b.submission_id = '${MINE}';`;
}

const ID = "current_setting('test.booking')::bigint";
const VERSION = "current_setting('test.version')::integer";

/** Run one decision as `sub`, keeping the answer in `test.<key>`. */
function as(sub: string, key: string, call: string): string {
  return `${asAuthenticated({ sub }, `select set_config('test.${key}', (${call})::text, true);`)}
reset role;`;
}

const answer = (key: string) => `current_setting('test.${key}')::jsonb`;

/** The booking and its rows, as postgres sees them. */
const STATE = `
select b.status, b.refund_status, b.version, b.decided_by, b.changed_by,
       (select count(*) from public.booking_event e where e.booking_id = b.id)::integer as events,
       (select count(*) from public.reservation r where r.booking_id = b.id and r.status = 'active')::integer as active_rows,
       (select count(*) from public.reservation r where r.booking_id = b.id and r.status = 'active' and r.payment_status = 'paid')::integer as paid_rows,
       (select count(*) from public.reservation r where r.booking_id = b.id and r.cancelled_by = 'oc_test_admin')::integer as staff_cancelled_rows
  from public.booking b where b.submission_id = '${MINE}'`;

describe.skipIf(!process.env.DB_TESTS)(
  "the staff check on the linked database",
  { timeout: 90_000 },
  () => {
    it("confirms for an admin: confirmed, every row paid, one event (AC-7, invariants 4 and 5)", async () => {
      const result = await query(
        rollback(`${PENDING}
          ${as("oc_test_admin", "answer", `public.confirm_online_booking(${ID}, ${VERSION})`)}
          select ${answer("answer")} ->> 'ok' as ok,
                 ${answer("answer")} ->> 'previous_status' as previous_status,
                 (${answer("answer")} ->> 'version')::integer = ${VERSION} + 1 as bumped,
                 stored.*
            from (${STATE}) stored;`),
      );
      expect(result).toMatchObject({
        ok: true,
        rows: [
          {
            ok: "true",
            previous_status: "pending_check",
            bumped: true,
            status: "confirmed",
            decided_by: "oc_test_admin",
            changed_by: "oc_test_admin",
            events: 1,
            active_rows: 2,
            paid_rows: 2,
          },
        ],
      });
    });

    it("refuses plain staff inside the function and writes nothing (AC-15)", async () => {
      const result = await query(
        rollback(`${PENDING}
          ${as("oc_test_staff", "c", `public.confirm_online_booking(${ID}, ${VERSION})`)}
          ${as("oc_test_staff", "r", `public.reject_online_booking(${ID}, ${VERSION}, 'no_payment', '', false)`)}
          ${as("oc_test_staff", "x", `public.cancel_online_booking(${ID}, ${VERSION}, 'player_asked', '', false)`)}
          select ${answer("c")} ->> 'reason' as confirm,
                 ${answer("r")} ->> 'reason' as reject,
                 ${answer("x")} ->> 'reason' as cancel,
                 stored.status, stored.events
            from (${STATE}) stored;`),
      );
      expect(result).toMatchObject({
        ok: true,
        rows: [
          {
            confirm: "forbidden",
            reject: "forbidden",
            cancel: "forbidden",
            status: "pending_check",
            events: 0,
          },
        ],
      });
    });

    it("answers stale on an old version and wrong_state on a booking already decided (AC-14)", async () => {
      const result = await query(
        rollback(`${PENDING}
          ${as("oc_test_admin", "old", `public.confirm_online_booking(${ID}, ${VERSION} - 1)`)}
          ${as("oc_test_admin", "first", `public.reject_online_booking(${ID}, ${VERSION}, 'no_payment', '', false)`)}
          ${remember()}
          ${as("oc_test_admin", "late", `public.confirm_online_booking(${ID}, ${VERSION})`)}
          select ${answer("old")} ->> 'reason' as old,
                 ${answer("late")} ->> 'reason' as late,
                 stored.status, stored.events
            from (${STATE}) stored;`),
      );
      expect(result).toMatchObject({
        ok: true,
        rows: [{ old: "stale", late: "wrong_state", status: "rejected", events: 1 }],
      });
    });

    it("turns down with a refund owed: rows not yet ended cancelled by the admin (AC-8, invariant 7a)", async () => {
      const result = await query(
        rollback(`${PENDING}
          ${as("oc_test_admin", "answer", `public.reject_online_booking(${ID}, ${VERSION}, 'amount_mismatch', '  Paid 500  ', true)`)}
          select stored.*,
                 (select e.reason || '|' || e.note || '|' || e.refund_owed
                    from public.booking_event e where e.booking_id = ${ID}) as event
            from (${STATE}) stored;`),
      );
      expect(result).toMatchObject({
        ok: true,
        rows: [
          {
            status: "rejected",
            refund_status: "owed",
            active_rows: 0,
            staff_cancelled_rows: 2,
            events: 1,
            event: "amount_mismatch|Paid 500|true",
          },
        ],
      });
    });

    it("refuses Other with no note, and a turn down after a cancel (AC-8, AC-10)", async () => {
      const result = await query(
        rollback(`${PENDING}
          ${as("oc_test_admin", "bare", `public.cancel_online_booking(${ID}, ${VERSION}, 'other', '  ', false)`)}
          ${as("oc_test_admin", "cancel", `public.cancel_online_booking(${ID}, ${VERSION}, 'player_asked', '', false)`)}
          ${remember()}
          ${as("oc_test_admin", "again", `public.reject_online_booking(${ID}, ${VERSION}, 'no_payment', '', false)`)}
          select ${answer("bare")} ->> 'reason' as bare,
                 ${answer("cancel")} ->> 'ok' as cancelled,
                 ${answer("again")} ->> 'reason' as again,
                 stored.status
            from (${STATE}) stored;`),
      );
      expect(result).toMatchObject({
        ok: true,
        rows: [{ bare: "invalid", cancelled: "true", again: "wrong_state", status: "cancelled" }],
      });
    });

    it("refuses a direct cancel of an unchecked booking's row, for plain staff and admins alike (AC-15)", async () => {
      for (const sub of ["oc_test_staff", "oc_test_admin"]) {
        const result = await query(
          rollback(`${PENDING}
            ${asAuthenticated(
              { sub },
              `update public.reservation set status = 'cancelled', changed_by = '${sub}'
                where booking_id = ${ID} and status = 'active';`,
            )}`),
        );
        expect(result).toMatchObject({ ok: false, sqlstate: "23514" });
        if (!result.ok) expect(result.message).toMatch(/^online_booking_guard:/);
      }
    });

    it("refuses a payment change after Confirm, and any booking_id change (AC-11, AC-15)", async () => {
      const paid = await query(
        rollback(`${PENDING}
          ${as("oc_test_admin", "answer", `public.confirm_online_booking(${ID}, ${VERSION})`)}
          ${asAuthenticated(
            { sub: "oc_test_staff" },
            `update public.reservation set payment_status = 'unpaid', changed_by = 'oc_test_staff'
              where booking_id = ${ID};`,
          )}`),
      );
      expect(paid).toMatchObject({ ok: false, sqlstate: "23514" });

      const relinked = await query(
        rollback(`${PENDING}
          ${asAuthenticated(
            { sub: "oc_test_staff" },
            `update public.reservation set booking_id = null where booking_id = ${ID};`,
          )}`),
      );
      expect(relinked).toMatchObject({ ok: false, sqlstate: "23514" });
    });

    it("copies a contact edit to the booking and its other rows without moving its version (AC-11)", async () => {
      const result = await query(
        rollback(`${PENDING}
          ${asAuthenticated(
            { sub: "oc_test_staff" },
            `update public.reservation set customer_phone = '+639179999999', changed_by = 'oc_test_staff'
              where id = (select min(id) from public.reservation where booking_id = ${ID});`,
          )}
          reset role;
          select b.customer_phone, b.version = ${VERSION} as same_version, b.changed_by,
                 (select count(*) from public.reservation r
                   where r.booking_id = b.id and r.status = 'active'
                     and r.customer_phone = '+639179999999')::integer as rows_copied
            from public.booking b where b.id = ${ID};`),
      );
      expect(result).toMatchObject({
        ok: true,
        rows: [
          {
            customer_phone: "+639179999999",
            same_version: true,
            changed_by: "oc_test_staff",
            rows_copied: 2,
          },
        ],
      });
    });

    it("gives authenticated no write on booking or booking_event (AC-15)", async () => {
      const update = await query(
        rollback(`${PENDING}
          ${asAuthenticated({ sub: "oc_test_admin" }, `update public.booking set status = 'confirmed' where id = ${ID};`)}`),
      );
      expect(update).toMatchObject({ ok: false, sqlstate: "42501" });

      const insert = await query(
        rollback(`${PENDING}
          ${asAuthenticated(
            { sub: "oc_test_admin" },
            `insert into public.booking_event (booking_id, kind, staff_id) values (${ID}, 'confirmed', 'oc_test_admin');`,
          )}`),
      );
      expect(insert).toMatchObject({ ok: false, sqlstate: "42501" });
    });

    it("keeps booking_event from anon, and lets active staff read it (AC-15)", async () => {
      const anon = await query(
        rollback(`set local role anon;
          select count(*) from public.booking_event;`),
      );
      expect(anon).toMatchObject({ ok: false, sqlstate: "42501" });

      const staff = await query(
        rollback(`${PENDING}
          ${as("oc_test_admin", "answer", `public.confirm_online_booking(${ID}, ${VERSION})`)}
          ${asAuthenticated({ sub: "oc_test_staff" }, `select count(*)::integer as n from public.booking_event where booking_id = ${ID};`)}`),
      );
      expect(staff).toMatchObject({ ok: true, rows: [{ n: 1 }] });
    });

    it("settles a refund once, with the amount, and refuses a second (AC-12)", async () => {
      const result = await query(
        rollback(`${PENDING}
          ${as("oc_test_admin", "reject", `public.reject_online_booking(${ID}, ${VERSION}, 'reference_mismatch', '', true)`)}
          ${remember()}
          ${as("oc_test_staff", "plain", `public.settle_online_refund(${ID}, ${VERSION}, 'refunded', 500, '')`)}
          ${as("oc_test_admin", "zero", `public.settle_online_refund(${ID}, ${VERSION}, 'refunded', 0, '')`)}
          ${as("oc_test_admin", "settle", `public.settle_online_refund(${ID}, ${VERSION}, 'refunded', 500, 'GCash')`)}
          ${remember()}
          ${as("oc_test_admin", "again", `public.settle_online_refund(${ID}, ${VERSION}, 'not_owed', 0, 'No money')`)}
          select ${answer("plain")} ->> 'reason' as plain,
                 ${answer("zero")} ->> 'reason' as zero,
                 ${answer("settle")} ->> 'ok' as settled,
                 ${answer("again")} ->> 'reason' as again,
                 b.refund_status, b.refund_amount::float as refund_amount, b.refunded_by,
                 (select count(*) from public.booking_event e where e.booking_id = b.id and e.kind = 'refunded')::integer as refund_events
            from public.booking b where b.id = ${ID};`),
      );
      expect(result).toMatchObject({
        ok: true,
        rows: [
          {
            plain: "forbidden",
            zero: "invalid",
            settled: "true",
            again: "wrong_state",
            refund_status: "refunded",
            refund_amount: 500,
            refunded_by: "oc_test_admin",
            refund_events: 1,
          },
        ],
      });
    });

    it("owes a refund when a payment arrives after the hold lapsed (AC-13)", async () => {
      const result = await query(
        rollback(`${PICK_SLOTS}
          ${asOnlineBooking()}
          ${hold("held", MINE)}
          reset role;
          update public.booking set status = 'expired' where submission_id = '${MINE}';
          update public.booking set submitted_at = now(), reference_last4 = '1234'
           where submission_id = '${MINE}';
          select status, refund_status from public.booking where submission_id = '${MINE}';`),
      );
      expect(result).toEqual({ ok: true, rows: [{ status: "expired", refund_status: "owed" }] });
    });

    it("never lists a screenshot as due while its refund is owed (AC-18, invariant 8)", async () => {
      const result = await query(
        rollback(`${PENDING}
          ${as("oc_test_admin", "reject", `public.reject_online_booking(${ID}, ${VERSION}, 'amount_mismatch', '', true)`)}
          update public.booking set decided_at = now() - interval '400 days' where id = ${ID};
          select exists (select 1 from public.payment_proofs_due(1000) d where d.booking_id = ${ID}) as owed_due;
          `),
      );
      expect(result).toEqual({ ok: true, rows: [{ owed_due: false }] });
    });
  },
);
