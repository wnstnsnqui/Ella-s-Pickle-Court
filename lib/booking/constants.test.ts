import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LOOKUP_DAYS_AFTER_LAST_SLOT } from "./constants";

/**
 * Spec 0017, AC-9 and invariant 6: the ended window is written twice, once in
 * `lookup_online_booking` and once here, and the two must be the same number.
 * The database test proves it against Postgres, but only runs with `DB_TESTS`;
 * this reads the window back out of the SQL on every run. Migrations are
 * forward only, so the last definition of the function is the one live today.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function lastDefinitionOf(fn: string): string {
  const bodies = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .flatMap((name) => {
      const sql = readFileSync(join(MIGRATIONS, name), "utf8");
      const start = sql.search(new RegExp(`create (or replace )?function public\\.${fn}\\(`, "i"));
      if (start === -1) return [];
      const open = sql.indexOf("$$", start);
      return [sql.slice(open + 2, sql.indexOf("$$", open + 2))];
    });
  if (bodies.length === 0) throw new Error(`No migration defines public.${fn}.`);
  return bodies[bodies.length - 1];
}

describe("the lookup window and the database agree", () => {
  it("ends a booking the same number of days after its last slot in both places (AC-9)", () => {
    const body = lastDefinitionOf("lookup_online_booking");
    const days = [...body.matchAll(/interval '(\d+) days?'/gi)].map((match) => Number(match[1]));
    expect(days).toContain(LOOKUP_DAYS_AFTER_LAST_SLOT);
    expect(days.every((value) => value === LOOKUP_DAYS_AFTER_LAST_SLOT)).toBe(true);
  });
});
