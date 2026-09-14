import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * The harness every database test shares: one batch per case, sent through
 * `supabase db query` to the linked project, wrapped in `begin … rollback` so
 * nothing survives. The CLI's login role owns the tables, and `set local role`
 * inside the batch is how a case speaks as `anon` or `authenticated`.
 *
 * Opt in through `npm run test:db`, because every case is a network round trip
 * and needs the CLI logged in and linked.
 */

const exec = promisify(execFile);

type QueryResult =
  { ok: true; rows: Record<string, unknown>[] } | { ok: false; sqlstate: string; message: string };

/** Runs one batch on the linked project and reads back the last statement's answer. */
export async function query(sql: string): Promise<QueryResult> {
  const args = ["supabase", "db", "query", "--linked", "--output-format", "json", sql];
  const cwd = new URL("../..", import.meta.url).pathname;
  // A SQL error makes the CLI exit non zero, with the JSON still on stdout.
  const { stdout } = await exec("npx", args, { cwd }).catch((error: { stdout?: string }) => {
    if (typeof error.stdout !== "string" || !error.stdout.includes("{")) throw error;
    return { stdout: error.stdout };
  });
  // The CLI prints a status line or two around the JSON; keep only the object.
  const json = stdout.slice(stdout.indexOf("{"), stdout.lastIndexOf("}") + 1);
  const parsed = JSON.parse(json) as
    { rows: Record<string, unknown>[] } | { _tag: "Error"; error: { message: string } };
  if ("rows" in parsed) return { ok: true, rows: parsed.rows };

  const match = /ERROR:\s+([0-9A-Z]{5}): ([^\n\\]*)/.exec(parsed.error.message);
  return {
    ok: false,
    sqlstate: match?.[1] ?? "?????",
    message: match?.[2] ?? parsed.error.message,
  };
}

/** A batch that runs as a signed in caller with these claims on the token. */
export function asAuthenticated(claims: Record<string, string>, sql: string) {
  const token = JSON.stringify({ role: "authenticated", ...claims }).replaceAll("'", "''");
  return [
    "set local role authenticated;",
    `select set_config('request.jwt.claims', '${token}', true);`,
    sql,
  ].join("\n");
}

export function rollback(sql: string) {
  return `begin;\n${sql}\nrollback;`;
}
