import { readFileSync } from "node:fs";

import { transform } from "lightningcss";
import { describe, expect, it } from "vitest";

/**
 * Spec 0017, AC-14: the checkout receipt prints from the top of the page, not
 * shifted off it by the dialog's centering. Tailwind 4 compiles the stylesheet
 * through Lightning CSS, which folds a `translate` declaration into `transform`
 * and drops it, so `translate: none` never reached the browser and the receipt
 * printed half a dialog up and to the left. The print block is compiled here the
 * same way, so a rule the compiler throws away fails this test.
 */

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** The `@media print { … }` block, braces matched. */
function printBlock(source: string): string {
  const start = source.indexOf("@media print {");
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("globals.css has no closed @media print block");
}

const compiled = transform({
  filename: "globals.css",
  code: Buffer.from(printBlock(css)),
  minify: true,
}).code.toString();

describe("the receipt's print styles, as compiled", () => {
  it("cancel the dialog's centering shift on the dialog content (AC-14)", () => {
    const rule =
      [...compiled.matchAll(/[^{}]*\[data-slot=dialog-content\][^{}]*\{([^}]*)\}/g)]
        .map((m) => m[1])
        .find((body) => body.includes("position:static!important")) ?? "";
    expect(rule).toContain("--tw-translate-x:0!important");
    expect(rule).toContain("--tw-translate-y:0!important");
  });
});
