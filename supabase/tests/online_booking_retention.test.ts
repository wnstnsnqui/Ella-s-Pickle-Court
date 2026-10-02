import { describe, expect, it } from "vitest";

import {
  CLIENT_HASH_RETENTION_DAYS,
  EMAIL_RETENTION_DAYS,
  PHONE_RETENTION_DAYS,
  PROOF_RETENTION_DAYS_AFTER_DECISION,
  PROOF_RETENTION_DAYS_UNCHECKED,
  PROOF_RETENTION_DAYS_UNSUBMITTED,
  REFERENCE_RETENTION_DAYS,
} from "../../lib/legal/constants";
import { query, rollback } from "./db";

/**
 * Spec 0015, AC-23 and invariant 8: the online booking retention rules as the
 * linked database runs them, with every boundary seeded from the constants
 * `/privacy` prints. A day either side of each number, so a change to one
 * side and not the other fails here.
 *
 * Opt in, like every test in this folder. Every case rolls back. Each seeded
 * booking has one cancelled row (outside `reservation_no_overlap`), because
 * what is under test is the age of the booking, not its slot.
 */

type Seed = {
  code: string;
  /** Days ago the booking's one slot ended; negative is in the future. */
  endedDaysAgo: number;
  /** Days ago the booking was made (and its hold ran). */
  madeDaysAgo?: number;
  submittedDaysAgo?: number | null;
  decidedDaysAgo?: number | null;
  proofPath?: string | null;
};

const ago = (days: number) => `now() - interval '${days} days'`;

function seed({
  code,
  endedDaysAgo,
  madeDaysAgo = 0,
  submittedDaysAgo = null,
  decidedDaysAgo = null,
  proofPath = null,
}: Seed) {
  const status =
    decidedDaysAgo !== null ? "confirmed" : submittedDaysAgo !== null ? "pending_check" : "expired";
  const submitted = submittedDaysAgo === null ? "null" : ago(submittedDaysAgo);
  const decided = decidedDaysAgo === null ? "null" : ago(decidedDaysAgo);
  const reference = submittedDaysAgo === null ? "null" : "'1234'";
  const path = proofPath === null ? "null" : `'${proofPath}'`;
  return `with b as (
    insert into public.booking (code, status, customer_name, customer_phone, customer_email,
      reference_last4, amount, hourly_rate, hold_expires_at, terms_version, terms_accepted_at,
      submission_id, client_hash, submitted_at, decided_at, proof_path, created_at)
    values ('${code}', '${status}', 'Retention Test', '+639171234567', 'test@example.com',
      ${reference}, 250, 250, ${ago(madeDaysAgo)} + interval '5 minutes', 'test', ${ago(madeDaysAgo)},
      gen_random_uuid(), 'retention-test', ${submitted}, ${decided}, ${path}, ${ago(madeDaysAgo)})
    returning id
  )
  insert into public.reservation (court_id, kind, status, starts_at, ends_at, customer_name,
    payment_status, amount, booking_id, cancelled_at)
  select (select min(id) from public.court), 'booking', 'cancelled',
    ${ago(endedDaysAgo)} - interval '1 hour', ${ago(endedDaysAgo)},
    'Retention Test', 'unpaid', 250, b.id, now()
  from b;`;
}

describe.skipIf(!process.env.DB_TESTS)(
  "online booking retention on the linked database",
  { timeout: 60_000 },
  () => {
    it("uses one age for the phone, the email and the digits, as the SQL does", () => {
      expect(EMAIL_RETENTION_DAYS).toBe(PHONE_RETENTION_DAYS);
      expect(REFERENCE_RETENTION_DAYS).toBe(PHONE_RETENTION_DAYS);
    });

    it("clears the details past their age and the client hash after a day (AC-23)", async () => {
      const result = await query(
        rollback(
          `${seed({ code: "RTNA2345", endedDaysAgo: EMAIL_RETENTION_DAYS + 1, madeDaysAgo: EMAIL_RETENTION_DAYS + 2, submittedDaysAgo: EMAIL_RETENTION_DAYS + 2 })}
           ${seed({ code: "RTNA2346", endedDaysAgo: EMAIL_RETENTION_DAYS - 1, madeDaysAgo: CLIENT_HASH_RETENTION_DAYS + 1, submittedDaysAgo: CLIENT_HASH_RETENTION_DAYS + 1 })}
           ${seed({ code: "RTNA2347", endedDaysAgo: -3, madeDaysAgo: 0, submittedDaysAgo: 0 })}
           select public.purge_online_booking_details();
           select code, customer_phone, customer_email, reference_last4, client_hash, customer_name
             from public.booking where code like 'RTNA%' order by code;`,
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          // Past 90 days: every detail gone, the name kept for the records.
          {
            code: "RTNA2345",
            customer_phone: null,
            customer_email: null,
            reference_last4: null,
            client_hash: null,
            customer_name: "Retention Test",
          },
          // Inside 90 days, but made more than a day ago: only the hash goes.
          {
            code: "RTNA2346",
            customer_phone: "+639171234567",
            customer_email: "test@example.com",
            reference_last4: "1234",
            client_hash: null,
            customer_name: "Retention Test",
          },
          // Made today: nothing goes.
          {
            code: "RTNA2347",
            customer_phone: "+639171234567",
            customer_email: "test@example.com",
            reference_last4: "1234",
            client_hash: "retention-test",
            customer_name: "Retention Test",
          },
        ],
      });
    });

    it("finds nothing more to clear on a second run", async () => {
      const result = await query(
        rollback(
          `${seed({ code: "RTND2345", endedDaysAgo: EMAIL_RETENTION_DAYS + 1, madeDaysAgo: EMAIL_RETENTION_DAYS + 2 })}
           select public.purge_online_booking_details();
           select public.purge_online_booking_details() as second_run;`,
        ),
      );
      expect(result).toEqual({ ok: true, rows: [{ second_run: 0 }] });
    });

    it("finds exactly the screenshots past each of the three ages (AC-23)", async () => {
      const decided = PROOF_RETENTION_DAYS_AFTER_DECISION;
      const unchecked = PROOF_RETENTION_DAYS_UNCHECKED;
      const unsubmitted = PROOF_RETENTION_DAYS_UNSUBMITTED;
      const result = await query(
        rollback(
          `${seed({ code: "RTNB2345", endedDaysAgo: decided + 5, madeDaysAgo: decided + 6, submittedDaysAgo: decided + 6, decidedDaysAgo: decided + 1, proofPath: "rtn/decided-due" })}
           ${seed({ code: "RTNB2346", endedDaysAgo: decided + 5, madeDaysAgo: decided + 6, submittedDaysAgo: decided + 6, decidedDaysAgo: decided - 1, proofPath: "rtn/decided-kept" })}
           ${seed({ code: "RTNB2347", endedDaysAgo: unchecked + 1, madeDaysAgo: unchecked + 2, submittedDaysAgo: unchecked + 2, proofPath: "rtn/unchecked-due" })}
           ${seed({ code: "RTNB2348", endedDaysAgo: unchecked - 1, madeDaysAgo: unchecked, submittedDaysAgo: unchecked, proofPath: "rtn/unchecked-kept" })}
           ${seed({ code: "RTNB2349", endedDaysAgo: -3, madeDaysAgo: unsubmitted + 1, proofPath: "rtn/unsubmitted-due" })}
           ${seed({ code: "RTNB234A", endedDaysAgo: -3, madeDaysAgo: 0, proofPath: "rtn/unsubmitted-kept" })}
           select proof_path from public.payment_proofs_due(1000)
            where proof_path like 'rtn/%' order by proof_path;`,
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          { proof_path: "rtn/decided-due" },
          { proof_path: "rtn/unchecked-due" },
          { proof_path: "rtn/unsubmitted-due" },
        ],
      });
    });

    it("forgets only the paths it is given", async () => {
      const result = await query(
        rollback(
          `${seed({ code: "RTNC2345", endedDaysAgo: -3, proofPath: "rtn/forget-me" })}
           ${seed({ code: "RTNC2346", endedDaysAgo: -3, proofPath: "rtn/keep-me" })}
           select public.forget_payment_proofs(array['rtn/forget-me']);
           select code, proof_path from public.booking where code like 'RTNC%' order by code;`,
        ),
      );
      expect(result).toEqual({
        ok: true,
        rows: [
          { code: "RTNC2345", proof_path: null },
          { code: "RTNC2346", proof_path: "rtn/keep-me" },
        ],
      });
    });

    it.each(["anon", "authenticated", "online_booking"])(
      "refuses %s on the purge and both proof functions (AC-20)",
      async (role) => {
        for (const call of [
          "select public.purge_online_booking_details();",
          "select * from public.payment_proofs_due();",
          "select public.forget_payment_proofs(array['x']);",
        ]) {
          const result = await query(rollback(`set local role ${role}; ${call}`));
          expect(result).toMatchObject({ ok: false, sqlstate: "42501" });
        }
      },
    );
  },
);
