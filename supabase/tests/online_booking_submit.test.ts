import { describe, expect, it } from "vitest";

import { query, rollback } from "./db";
import { asOnlineBooking, hold, PICK_SLOTS, uploadProof } from "./online_booking";

/**
 * Spec 0015, AC-12, AC-13 and AC-20: `submit_online_booking` as the linked
 * database runs it. The proof must be at the path the hold issued; a live hold
 * books at once; a lapsed one takes its slots again if every one is still
 * free, or keeps the payment on the expired booking for a refund. The same
 * call repeated answers the same way and never books twice.
 *
 * Opt in, like every test in this folder. Every case rolls back. `now()` is
 * fixed for a transaction, so a hold is made to lapse by moving its expiry back.
 */

const MINE = "00000000-0000-4000-8000-00000000c001";
const THEIRS = "00000000-0000-4000-8000-00000000c002";

/** Submit as `online_booking`, keeping the answer in `test.<key>`. */
function submit(key: string, digits = "1234", submission = MINE): string {
  return `select set_config('test.${key}', public.submit_online_booking('${submission}', '${digits}')::text, true);`;
}

/** Hold all three picks for `MINE` and upload its proof. */
const HELD_WITH_PROOF = `${PICK_SLOTS}
${asOnlineBooking()}
${hold("held", MINE)}
reset role;
${uploadProof(MINE)}`;

const LAPSE = `update public.booking set hold_expires_at = now() - interval '1 second'
 where submission_id = '${MINE}';`;

/** The booking's state and how many of its rows are active and cancelled. */
const STATE = `
select b.status, b.reference_last4, b.submitted_at is not null as submitted,
       b.amount::float as amount,
       (b.hold_expires_at = (current_setting('test.held')::jsonb ->> 'hold_expires_at')::timestamptz) as expiry_kept,
       (select count(*) from public.reservation r where r.booking_id = b.id and r.status = 'active')::integer as active_rows,
       (select count(*) from public.reservation r where r.booking_id = b.id and r.status = 'cancelled')::integer as cancelled_rows
  from public.booking b
 where b.submission_id = '${MINE}'`;

describe.skipIf(!process.env.DB_TESTS)(
  "submit_online_booking on the linked database",
  { timeout: 60_000 },
  () => {
    it("refuses a confirm before any screenshot is at the issued path (AC-12)", async () => {
      const result = await query(
        rollback(`${PICK_SLOTS}
          ${asOnlineBooking()}
          ${hold("held", MINE)}
          ${submit("answer")}
          reset role;
          select current_setting('test.answer')::jsonb as answer, stored.status
            from (${STATE}) stored;`),
      );
      expect(result).toEqual({
        ok: true,
        rows: [{ answer: { ok: false, reason: "proof_missing" }, status: "held" }],
      });
    });

    it("books a live hold: pending_check, the digits, the expiry kept; the same call again books nothing new (AC-12)", async () => {
      const result = await query(
        rollback(`${HELD_WITH_PROOF}
          ${asOnlineBooking()}
          ${submit("first")}
          ${submit("again")}
          reset role;
          select current_setting('test.first')::jsonb ->> 'status' as answered,
                 (current_setting('test.first')::jsonb ->> 'retaken')::boolean as retaken,
                 current_setting('test.first')::jsonb ->> 'reference_last4' as digits,
                 (current_setting('test.first')::jsonb - 'server_now')
                   = (current_setting('test.again')::jsonb - 'server_now') as same_answer,
                 stored.*
            from (${STATE}) stored;`),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          {
            answered: "pending_check",
            retaken: false,
            digits: "1234",
            same_answer: true,
            status: "pending_check",
            reference_last4: "1234",
            submitted: true,
            amount: expect.any(Number),
            expiry_kept: true,
            active_rows: 2,
            cancelled_rows: 0,
          },
        ],
      });
    });

    it("retakes a lapsed hold's slots when every one is still free, keeping its amount (AC-12)", async () => {
      const result = await query(
        rollback(`${HELD_WITH_PROOF}
          ${LAPSE}
          ${asOnlineBooking()}
          ${submit("answer")}
          reset role;
          select current_setting('test.answer')::jsonb ->> 'status' as answered,
                 (current_setting('test.answer')::jsonb ->> 'retaken')::boolean as retaken,
                 (current_setting('test.answer')::jsonb ->> 'amount')::float
                   = (current_setting('test.held')::jsonb ->> 'amount')::float as amount_kept,
                 stored.status, stored.active_rows, stored.cancelled_rows
            from (${STATE}) stored;`),
      );
      // The first rows stay linked and cancelled; fresh active rows replace them.
      expect(result).toEqual({
        ok: true,
        rows: [
          {
            answered: "pending_check",
            retaken: true,
            amount_kept: true,
            status: "pending_check",
            active_rows: 2,
            cancelled_rows: 2,
          },
        ],
      });
    });

    it("books nothing when a lapsed hold lost a slot, but keeps the payment for a refund, the same every time (AC-13)", async () => {
      const result = await query(
        rollback(`${HELD_WITH_PROOF}
          ${LAPSE}
          ${asOnlineBooking()}
          ${hold("theirs", THEIRS, { picks: "jsonb_build_array(current_setting('test.picks')::jsonb -> 2)" })}
          ${submit("first", "9876")}
          ${submit("again", "9876")}
          reset role;
          select current_setting('test.theirs')::jsonb ->> 'ok' as theirs_held,
                 current_setting('test.first')::jsonb ->> 'reason' as reason,
                 (current_setting('test.first')::jsonb -> 'slots' -> 0 ->> 'court_id')::bigint
                   = current_setting('test.court2')::bigint as names_court_2,
                 jsonb_array_length(current_setting('test.first')::jsonb -> 'slots') as gone,
                 current_setting('test.first') = current_setting('test.again') as same_answer,
                 stored.status, stored.reference_last4, stored.submitted, stored.active_rows
            from (${STATE}) stored;`),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          {
            theirs_held: "true",
            reason: "slot_taken",
            names_court_2: true,
            gone: 1,
            same_answer: true,
            status: "expired",
            reference_last4: "9876",
            submitted: true,
            active_rows: 0,
          },
        ],
      });
    });

    it("locks the proof once submitted, so the screenshot staff check is the one that was sent (AC-20)", async () => {
      const result = await query(
        rollback(`${HELD_WITH_PROOF}
          ${asOnlineBooking()}
          ${submit("answer")}
          reset role;
          ${uploadProof(MINE)}`),
      );
      expect(result).toMatchObject({ ok: false, sqlstate: "42501" });
    });

    it.each([
      ["digits that are not 4 digits", "12a4", MINE, "invalid"],
      ["a submission nobody holds", "1234", THEIRS, "not_found"],
    ])("answers %s with %s", async (_, digits, submission, reason) => {
      const result = await query(
        rollback(`${HELD_WITH_PROOF}
          ${asOnlineBooking()}
          ${submit("answer", digits, submission)}
          reset role;
          select current_setting('test.answer')::jsonb as answer;`),
      );
      expect(result).toEqual({ ok: true, rows: [{ answer: { ok: false, reason } }] });
    });

    it.each(["anon", "authenticated"])("refuses %s on the submit (AC-20)", async (role) => {
      const result = await query(
        rollback(`set local role ${role}; select public.submit_online_booking('${MINE}', '1234');`),
      );
      expect(result).toMatchObject({ ok: false, sqlstate: "42501" });
    });
  },
);
