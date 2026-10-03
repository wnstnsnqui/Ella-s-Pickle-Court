import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PAYMENT_STATUSES,
  RESERVATION_KINDS,
  RESERVATION_STATUSES,
  SLOT_MINUTES,
  STAFF_ROLES,
} from "./constants";

/**
 * AC-12, made real rather than promised.
 *
 * `constants.ts` is the one definition and the Zod schemas are built from it,
 * so those two cannot drift. The check constraints in the migration are the
 * third copy, and this reads them back out of the SQL. Change a value in one
 * place and this fails until the other place agrees.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function migrationSql(): string {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS, name), "utf8"))
    .join("\n");
}

/**
 * Pull the values out of `check (<column> in ('a', 'b'))`. Migrations are
 * forward only, so a widened column (spec 0012 widens `role`) reappears as a
 * later `drop constraint` / `add constraint` pair rather than an edit to the
 * original; the last match across every migration, in file order, is the
 * constraint actually live today. `constraint` narrows the match to one named
 * constraint, for a column name two tables share (`booking` has a `status`
 * too since spec 0015, and `booking_event` a `kind` since spec 0016).
 */
function checkedValues(sql: string, column: string, constraint?: string): string[] {
  const prefix = constraint ? `${constraint}\\s+` : "";
  const matches = [
    ...sql.matchAll(new RegExp(`${prefix}check\\s*\\(\\s*${column}\\s+in\\s*\\(([^)]*)\\)`, "gi")),
  ];
  if (matches.length === 0) throw new Error(`No check constraint found for ${column}.`);
  const [, values] = matches[matches.length - 1];
  return values
    .split(",")
    .map((value) => value.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);
}

describe("the value lists and the database agree", () => {
  const sql = migrationSql();

  it("keeps reservation kinds in step", () => {
    // `booking_event` has a `kind` too since spec 0016.
    expect(checkedValues(sql, "kind", "reservation_kind_check")).toEqual([...RESERVATION_KINDS]);
  });

  it("keeps reservation statuses in step", () => {
    expect(checkedValues(sql, "status", "reservation_status_check")).toEqual([
      ...RESERVATION_STATUSES,
    ]);
  });

  it("keeps payment statuses in step", () => {
    expect(checkedValues(sql, "payment_status")).toEqual([...PAYMENT_STATUSES]);
  });

  it("keeps staff roles in step", () => {
    expect(checkedValues(sql, "role")).toEqual([...STAFF_ROLES]);
  });

  it("keeps the slot lengths in step", () => {
    expect(checkedValues(sql, "slot_minutes").map(Number)).toEqual([...SLOT_MINUTES]);
  });
});
