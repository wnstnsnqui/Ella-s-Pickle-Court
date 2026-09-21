import { describe, expect, it } from "vitest";

import { asAuthenticated, query, rollback } from "./db";

/**
 * Spec 0004 (revised), AC-1, AC-3, AC-5, AC-7 and AC-10: the `staff_invite`
 * table, its grants and policy, the five link functions, and the invite
 * role `ensure_staff()` hands a new row, as the linked database actually
 * runs them. Opt in like every test in this folder: `npm run test:db`.
 *
 * Every case seeds its own rows inside the transaction it rolls back, so
 * nothing survives. The real owner row, if any, is demoted for the duration
 * because `staff_single_owner_idx` allows one owner at a time.
 */

const HASH = "a".repeat(64);
const HASH2 = "b".repeat(64);
// Fixed ids, because `token_hash` is not granted to `authenticated`: a case
// running as a signed in caller cannot look a link up by its hash.
const INVITE_ID = "11111111-1111-4111-8111-111111111111";
const RESET_ID = "22222222-2222-4222-8222-222222222222";

const SEED = `
  update public.staff set role = 'admin' where role = 'owner';
  insert into public.staff (user_id, display_name, username, role, is_active, version) values
    ('si_owner', 'SI Owner', 'si_owner', 'owner', true, 1),
    ('si_super', 'SI Super', 'si_super', 'superadmin', true, 1),
    ('si_staff', 'SI Staff', 'si_staff', 'staff', true, 1),
    ('si_inactive', 'SI Inactive', 'si_inactive', 'staff', false, 1)
  on conflict (user_id) do update
    set role = excluded.role, is_active = excluded.is_active, version = excluded.version;
`;

/** A pending invite and a pending reset, inserted directly as the migration role. */
const LINKS = `
  insert into public.staff_invite (id, token_hash, kind, role, created_by, expires_at)
  values ('${INVITE_ID}', '${HASH}', 'invite', 'admin', 'si_owner', now() + interval '7 days');
  insert into public.staff_invite (id, token_hash, kind, target_user_id, created_by, expires_at)
  values ('${RESET_ID}', '${HASH2}', 'reset', 'si_staff', 'si_owner', now() + interval '7 days');
`;

const asRole = (role: string, sql: string) => `set local role ${role};\n${sql}`;

describe.skipIf(!process.env.DB_TESTS)(
  "staff_invite on the linked database",
  { timeout: 60_000 },
  () => {
    describe("grants and the policy (AC-3, AC-10)", () => {
      it("lets an owner read pending links but never token_hash", async () => {
        const rows = await query(
          rollback(
            SEED +
              LINKS +
              asAuthenticated(
                { sub: "si_owner" },
                "select id, kind, role from public.staff_invite;",
              ),
          ),
        );
        expect(rows).toMatchObject({ ok: true });
        if (rows.ok) expect(rows.rows).toHaveLength(2);

        const hash = await query(
          rollback(
            SEED +
              LINKS +
              asAuthenticated({ sub: "si_owner" }, "select token_hash from public.staff_invite;"),
          ),
        );
        expect(hash).toMatchObject({ ok: false, sqlstate: "42501" });
      });

      it("gives a staff caller zero rows, and anon nothing at all", async () => {
        const staff = await query(
          rollback(
            SEED +
              LINKS +
              asAuthenticated(
                { sub: "si_staff" },
                "select count(*)::int as n from public.staff_invite;",
              ),
          ),
        );
        expect(staff).toMatchObject({ ok: true, rows: [{ n: 0 }] });

        const anon = await query(
          rollback(SEED + LINKS + asRole("anon", "select id from public.staff_invite;")),
        );
        expect(anon).toMatchObject({ ok: false, sqlstate: "42501" });
      });

      it("grants no insert, update or delete to authenticated", async () => {
        const insert = await query(
          rollback(
            SEED +
              asAuthenticated(
                { sub: "si_owner" },
                `insert into public.staff_invite (token_hash, kind, role, created_by, expires_at) values ('${HASH}', 'invite', 'staff', 'si_owner', now());`,
              ),
          ),
        );
        expect(insert).toMatchObject({ ok: false, sqlstate: "42501" });
      });

      // Five round trips in one case: more room than the suite default.
      it("lets anon execute none of the link functions", { timeout: 180_000 }, async () => {
        for (const call of [
          `select public.claim_staff_invite('${HASH}', 'probe');`,
          `select public.claim_staff_reset('${HASH2}');`,
          `select * from public.peek_staff_invite('${HASH}');`,
          `select public.create_staff_invite('invite', 'staff', null, '${HASH}');`,
          "select public.revoke_staff_invite(gen_random_uuid());",
        ]) {
          const result = await query(rollback(SEED + LINKS + asRole("anon", call)));
          expect(result, call).toMatchObject({ ok: false, sqlstate: "42501" });
        }
      });

      it(
        "keeps the claim and peek functions away from authenticated too (invariant 7)",
        { timeout: 180_000 },
        async () => {
          for (const call of [
            `select public.claim_staff_invite('${HASH}', 'probe');`,
            `select public.claim_staff_reset('${HASH2}');`,
            `select * from public.peek_staff_invite('${HASH}');`,
          ]) {
            const result = await query(
              rollback(SEED + LINKS + asAuthenticated({ sub: "si_owner" }, call)),
            );
            expect(result, call).toMatchObject({ ok: false, sqlstate: "42501" });
          }
        },
      );

      it("hides the better_auth schema from anon and authenticated (AC-10)", async () => {
        for (const role of ["anon", "authenticated"]) {
          const result = await query(
            rollback(asRole(role, 'select count(*) from better_auth."user";')),
          );
          expect(result, role).toMatchObject({ ok: false, sqlstate: "42501" });
        }
      });
    });

    describe("create_staff_invite (AC-3)", () => {
      it("lets an owner or superadmin make an invite with created_by and a 7 day expiry from the database clock", async () => {
        for (const caller of ["si_owner", "si_super"]) {
          const result = await query(
            rollback(
              SEED +
                asAuthenticated(
                  { sub: caller },
                  `select created_by, role, kind, (expires_at - created_at) = interval '7 days' as seven_days from public.create_staff_invite('invite', 'staff', null, '${HASH}');`,
                ),
            ),
          );
          expect(result, caller).toMatchObject({
            ok: true,
            rows: [{ created_by: caller, role: "staff", kind: "invite", seven_days: true }],
          });
        }
      });

      it("refuses a staff caller and an inactive caller", async () => {
        for (const caller of ["si_staff", "si_inactive"]) {
          const result = await query(
            rollback(
              SEED +
                asAuthenticated(
                  { sub: caller },
                  `select public.create_staff_invite('invite', 'staff', null, '${HASH}');`,
                ),
            ),
          );
          expect(result, caller).toMatchObject({ ok: false, sqlstate: "42501" });
        }
      });

      it("caps superadmin invites at two holders (22023)", async () => {
        const result = await query(
          rollback(
            SEED +
              "insert into public.staff (user_id, display_name, role) values ('si_super2', 'SI Super 2', 'superadmin');" +
              asAuthenticated(
                { sub: "si_owner" },
                `select public.create_staff_invite('invite', 'superadmin', null, '${HASH}');`,
              ),
          ),
        );
        expect(result).toMatchObject({ ok: false, sqlstate: "22023" });
      });

      it("refuses a reset for the caller's own row, for an inactive account, and with no target", async () => {
        for (const target of ["'si_owner'", "'si_inactive'", "null"]) {
          const result = await query(
            rollback(
              SEED +
                asAuthenticated(
                  { sub: "si_owner" },
                  `select public.create_staff_invite('reset', null, ${target}, '${HASH}');`,
                ),
            ),
          );
          expect(result, target).toMatchObject({ ok: false, sqlstate: "22023" });
        }
      });

      it("makes a reset for another active account", async () => {
        const result = await query(
          rollback(
            SEED +
              asAuthenticated(
                { sub: "si_owner" },
                `select kind, target_user_id, role from public.create_staff_invite('reset', null, 'si_staff', '${HASH}');`,
              ),
          ),
        );
        expect(result).toMatchObject({
          ok: true,
          rows: [{ kind: "reset", target_user_id: "si_staff", role: null }],
        });
      });
    });

    describe("revoke_staff_invite (AC-3)", () => {
      it("revokes a pending link once, and refuses the second time with P0002", async () => {
        const result = await query(
          rollback(
            SEED +
              LINKS +
              asAuthenticated(
                { sub: "si_super" },
                `select public.revoke_staff_invite('${INVITE_ID}');
                 select public.revoke_staff_invite('${INVITE_ID}');`,
              ),
          ),
        );
        expect(result).toMatchObject({ ok: false, sqlstate: "P0002" });
      });

      it("refuses a staff caller", async () => {
        const result = await query(
          rollback(
            SEED +
              LINKS +
              asAuthenticated(
                { sub: "si_staff" },
                `select public.revoke_staff_invite('${INVITE_ID}');`,
              ),
          ),
        );
        expect(result).toMatchObject({ ok: false, sqlstate: "42501" });
      });
    });

    describe("claim_staff_invite, claim_staff_reset and peek (AC-1, AC-7)", () => {
      it("claims a pending invite once, returning its role, and null the second time", async () => {
        const result = await query(
          rollback(
            SEED +
              LINKS +
              `select public.claim_staff_invite('${HASH}', ' New.Person ') as first,
                      public.claim_staff_invite('${HASH}', 'new.person') as second;`,
          ),
        );
        expect(result).toMatchObject({ ok: true, rows: [{ first: "admin", second: null }] });
      });

      it("lower cases and trims the claimed username", async () => {
        const result = await query(
          rollback(
            SEED +
              LINKS +
              `select public.claim_staff_invite('${HASH}', ' New.Person ');
               select claimed_username from public.staff_invite where token_hash = '${HASH}';`,
          ),
        );
        expect(result).toMatchObject({ ok: true, rows: [{ claimed_username: "new.person" }] });
      });

      it("refuses an expired, a revoked, and a reset link as an invite", async () => {
        const result = await query(
          rollback(
            SEED +
              LINKS +
              `update public.staff_invite set expires_at = now() - interval '1 second' where token_hash = '${HASH}';
               select public.claim_staff_invite('${HASH}', 'probe') as expired,
                      public.claim_staff_invite('${HASH2}', 'probe') as wrong_kind;`,
          ),
        );
        expect(result).toMatchObject({ ok: true, rows: [{ expired: null, wrong_kind: null }] });
      });

      it("claims a reset once, returning the target and setting claimed_by", async () => {
        const result = await query(
          rollback(
            SEED +
              LINKS +
              `select public.claim_staff_reset('${HASH2}') as first, public.claim_staff_reset('${HASH2}') as second;
               select claimed_by from public.staff_invite where token_hash = '${HASH2}';`,
          ),
        );
        expect(result).toMatchObject({ ok: true, rows: [{ claimed_by: "si_staff" }] });
      });

      it("peeks a pending link with the reset target's username, and nothing once claimed", async () => {
        const pending = await query(
          rollback(SEED + LINKS + `select * from public.peek_staff_invite('${HASH2}');`),
        );
        expect(pending).toMatchObject({
          ok: true,
          rows: [{ kind: "reset", target_username: "si_staff" }],
        });

        const claimed = await query(
          rollback(
            SEED +
              LINKS +
              `select public.claim_staff_reset('${HASH2}');
               select count(*)::int as n from public.peek_staff_invite('${HASH2}');`,
          ),
        );
        expect(claimed).toMatchObject({ ok: true, rows: [{ n: 0 }] });
      });
    });

    describe("ensure_staff and the invite's role (AC-5)", () => {
      it("gives a new row the role of the claimed invite for its username, once", async () => {
        const result = await query(
          rollback(
            SEED +
              LINKS +
              `select public.claim_staff_invite('${HASH}', 'new.person');` +
              asAuthenticated(
                { sub: "si_new", username: "New.Person", name: "New Person" },
                `select role from public.ensure_staff();
                 reset role;
                 select claimed_by from public.staff_invite where id = '${INVITE_ID}';`,
              ),
          ),
        );
        expect(result).toMatchObject({ ok: true, rows: [{ claimed_by: "si_new" }] });

        const role = await query(
          rollback(
            SEED +
              LINKS +
              `select public.claim_staff_invite('${HASH}', 'new.person');` +
              asAuthenticated(
                { sub: "si_new", username: "new.person", name: "New Person" },
                "select role from public.ensure_staff();",
              ),
          ),
        );
        expect(role).toMatchObject({ ok: true, rows: [{ role: "admin" }] });
      });

      it("falls back to staff when no invite was claimed for that username", async () => {
        const result = await query(
          rollback(
            SEED +
              asAuthenticated(
                { sub: "si_uninvited", username: "nobody", name: "Nobody" },
                "select role from public.ensure_staff();",
              ),
          ),
        );
        expect(result).toMatchObject({ ok: true, rows: [{ role: "staff" }] });
      });

      it("never changes an existing row's role on a refresh, even with a newer claim for its username", async () => {
        const result = await query(
          rollback(
            SEED +
              LINKS +
              `select public.claim_staff_invite('${HASH}', 'si_staff');` +
              asAuthenticated(
                { sub: "si_staff", username: "si_staff", name: "SI Staff" },
                "select role from public.ensure_staff();",
              ),
          ),
        );
        expect(result).toMatchObject({ ok: true, rows: [{ role: "staff" }] });
      });
    });
  },
);
