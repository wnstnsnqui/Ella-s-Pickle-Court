import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Regression guard for the bug that shipped with spec 0012: `isOwnerLevel`
 * lived in `lib/staff.ts` (which starts `import "server-only"` and pulls in
 * the server side session read), and a `"use client"` file imported it directly.
 * Next's client/server boundary check refuses to bundle that, and because
 * the file sat on the path from the root layout, every route in the app
 * returned 500, not just the new screen. `npm run check` stayed green
 * throughout: vitest runs in Node, not a bundler, so nothing else here would
 * have caught it.
 *
 * This walks every `"use client"` file's top level imports and fails if any
 * non type only import resolves to a module that itself starts with
 * `import "server-only"`.
 */

const ROOT = new URL("../", import.meta.url).pathname;
const SCAN_DIRS = ["app", "components", "lib"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build"]);

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (
      /\.(ts|tsx)$/.test(entry) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx")
    ) {
      out.push(full);
    }
  }
  return out;
}

const files = SCAN_DIRS.flatMap((dir) => listSourceFiles(join(ROOT, dir)));

/** Every module that starts `import "server-only";`, keyed by its `@/...` specifier. */
const serverOnlyModules = new Set(
  files
    .filter((file) => readFileSync(file, "utf8").trimStart().startsWith('import "server-only"'))
    .map((file) => "@/" + relative(ROOT, file).replace(/\.tsx?$/, "")),
);

/** Non type only `import ... from "..."` specifiers in a file's source. */
function importedModules(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(/^import\s+(?!type\s)[^;]*?from\s+["']([^"']+)["'];?/gm)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

describe("a client component never imports a server-only module", () => {
  it("has at least one server-only module to check against (sanity check)", () => {
    expect(serverOnlyModules.size).toBeGreaterThan(0);
  });

  const clientFiles = files.filter((file) =>
    readFileSync(file, "utf8").trimStart().startsWith('"use client"'),
  );

  it.each(clientFiles)("%s", (file) => {
    const source = readFileSync(file, "utf8");
    const offending = importedModules(source).filter((specifier) =>
      serverOnlyModules.has(specifier),
    );
    expect(
      offending,
      `${relative(ROOT, file)} imports server-only module(s): ${offending.join(", ")}`,
    ).toEqual([]);
  });
});

/**
 * Spec 0004 (revised), invariant 6: `SUPABASE_JWT_SECRET` can sign a
 * `service_role` token, so exactly one module may read it, and every token
 * it mints is `authenticated` for five minutes. A second reader anywhere in
 * `app/` or `lib/` fails this before it can ship.
 */
describe("SUPABASE_JWT_SECRET is read by lib/supabase/staff-token.ts and nowhere else", () => {
  /** The name on a line of code, not in a comment explaining the rule. */
  const readsSecret = (source: string) =>
    source
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
      .some((line) => line.includes("SUPABASE_JWT_SECRET"));

  const readers = files
    .filter((file) => readsSecret(readFileSync(file, "utf8")))
    .map((file) => relative(ROOT, file));

  it("has exactly one reader", () => {
    expect(readers).toEqual(["lib/supabase/staff-token.ts"]);
  });
});

/**
 * Spec 0015, the Decision and Consequences: `mintOnlineBookingToken()` hands
 * out the `online_booking` role, the public write path. Only the checkout
 * actions may call it, after their own checks, so a second caller anywhere
 * would be a way to write without Turnstile.
 */
describe("mintOnlineBookingToken is called from lib/booking/actions.ts and nowhere else", () => {
  const callsMinter = (source: string) =>
    source
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
      .some((line) => line.includes("mintOnlineBookingToken"));

  const callers = files
    .map((file) => relative(ROOT, file))
    .filter((file) => file !== "lib/supabase/staff-token.ts")
    .filter((file) => callsMinter(readFileSync(join(ROOT, file), "utf8")));

  it("has exactly one caller", () => {
    expect(callers).toEqual(["lib/booking/actions.ts"]);
  });
});

/**
 * Spec 0004 (revised), invariant 7: `authPool()` is the only handle on the
 * `better_auth_app` role, and only Better Auth itself, the three pre
 * authentication actions, the gate they share, and the three public auth
 * pages may hold it. Any other importer would be a way around
 * `staffSupabase()` and the policies, so the list is closed here.
 */
describe("lib/auth/pool.ts is imported only where the spec allows", () => {
  const allowed = new Set([
    "lib/auth.ts",
    "lib/auth/gate.ts",
    "lib/auth/actions.ts",
    "app/sign-up/page.tsx",
    "app/sign-up/[token]/page.tsx",
    "app/reset/[token]/page.tsx",
  ]);

  const importers = files
    .filter((file) => importedModules(readFileSync(file, "utf8")).includes("@/lib/auth/pool"))
    .map((file) => relative(ROOT, file));

  it("has only the allowed importers", () => {
    expect(importers.filter((file) => !allowed.has(file))).toEqual([]);
  });

  it("is actually imported by the auth core (sanity check)", () => {
    expect(importers).toContain("lib/auth.ts");
  });
});

/**
 * Spec 0004 (revised), invariant 7 and AC-11: `lib/auth.ts` and
 * `lib/auth/pool.ts` are `server-only`, so no Client Component can ever pull
 * Better Auth's server instance or the pool into a browser bundle.
 */
describe("the auth core is server-only", () => {
  it.each(["@/lib/auth", "@/lib/auth/pool", "@/lib/auth/session", "@/lib/auth/gate"])(
    '%s starts with import "server-only"',
    (specifier) => {
      expect(serverOnlyModules.has(specifier)).toBe(true);
    },
  );
});

/**
 * Spec 0003 and the icons rule in `AGENTS.md`: Phosphor's main entry reads
 * React context, so a file without `"use client"` that imports it fails at
 * render. Such a file uses `@phosphor-icons/react/ssr`. `lucide-react` was
 * replaced by Phosphor and must not come back. Both are invisible to a Node
 * test run and to the typecheck, which is why they are pinned here.
 */
describe("icons come from the right Phosphor entry, and never from lucide-react", () => {
  const isClient = (source: string) => /^\s*["']use client["']/.test(source);

  it('a file without "use client" imports Phosphor only from the /ssr entry', () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return !isClient(source) && importedModules(source).includes("@phosphor-icons/react");
    });
    expect(offenders.map((file) => relative(ROOT, file))).toEqual([]);
  });

  it("no file imports lucide-react", () => {
    const offenders = files.filter((file) =>
      /from\s+["']lucide-react["']/.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map((file) => relative(ROOT, file))).toEqual([]);
  });

  it("finds Phosphor imports to check (sanity check)", () => {
    const users = files.filter((file) =>
      /from\s+["']@phosphor-icons\/react(\/ssr)?["']/.test(readFileSync(file, "utf8")),
    );
    expect(users.length).toBeGreaterThan(10);
  });
});
