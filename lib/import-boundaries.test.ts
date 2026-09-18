import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Regression guard for the bug that shipped with spec 0012: `isOwnerLevel`
 * lived in `lib/staff.ts` (which starts `import "server-only"` and pulls in
 * `@clerk/nextjs/server`), and a `"use client"` file imported it directly.
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
