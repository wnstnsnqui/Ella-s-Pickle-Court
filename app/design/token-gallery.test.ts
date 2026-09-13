import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ColorTokens, SpaceAndRadius, TypeScale } from "./token-gallery";

/**
 * Spec 0003, AC-1 and AC-3: `/design` shows every token as the thing it is, and
 * `app/globals.css` is the only source of truth. So the gallery has to name real
 * tokens: a swatch for a token the stylesheet no longer defines would paint
 * nothing and nobody would notice. The stylesheet is read here to close that gap.
 */

const css = readFileSync(new URL("../globals.css", import.meta.url), "utf8");

/** Every `--name:` the stylesheet defines, in either theme. */
const defined = new Set([...css.matchAll(/^\s*(--[a-z][a-z0-9-]*)\s*:/gm)].map((m) => m[1]));

function tokensNamedIn(html: string) {
  return [...html.matchAll(/<code[^>]*>(--[a-z][a-z0-9-]*)</g)].map((m) => m[1]);
}

describe("ColorTokens", () => {
  const html = renderToStaticMarkup(createElement(ColorTokens));

  it("names every surface, accent and state token as a code sample (AC-3)", () => {
    const names = tokensNamedIn(html);
    expect(names).toEqual(
      expect.arrayContaining([
        "--background",
        "--foreground",
        "--card",
        "--muted",
        "--muted-foreground",
        "--accent",
        "--secondary",
        "--border",
        "--input",
        "--ring",
        "--primary",
        "--primary-foreground",
        "--brand",
        "--brand-foreground",
        "--mark",
        "--mark-foreground",
        "--destructive",
        "--destructive-foreground",
        "--state-available",
        "--state-booked",
        "--state-unavailable",
        "--state-outofhours",
        "--state-selected",
      ]),
    );
  });

  it("only names tokens that app/globals.css actually defines (AC-1)", () => {
    for (const name of tokensNamedIn(html)) {
      expect(defined, `${name} is shown on /design but not defined in globals.css`).toContain(name);
    }
  });

  it("shows the five state roles with a fill, a text colour and a boundary each (AC-5)", () => {
    expect(html.match(/fill · text · boundary/g)).toHaveLength(5);
    for (const state of ["available", "booked", "unavailable", "outofhours", "selected"]) {
      expect(html).toContain(
        `bg-state-${state} text-state-${state}-fg border-state-${state}-border`,
      );
    }
  });

  it("groups the tokens under three headings", () => {
    expect(html.match(/<h4/g)).toHaveLength(3);
    expect(html).toContain(">Surface<");
    expect(html).toContain(">Accent<");
    expect(html).toContain(">State<");
  });
});

describe("TypeScale", () => {
  const html = renderToStaticMarkup(createElement(TypeScale));

  it("shows all six type steps, each set in its own utility (AC-1)", () => {
    for (const step of ["display", "title", "body", "label", "cell", "caption"]) {
      expect(html).toMatch(new RegExp(`class="text-${step}[^"]*">${step} · `));
    }
    expect(html.match(/<li/g)).toHaveLength(6);
  });

  it("sets the cell step in tabular figures so times line up (AC-9)", () => {
    expect(html).toMatch(/class="text-cell tabular-nums"/);
  });

  it("uses venue time labels as the specimen (AC-9)", () => {
    expect(html).toContain("9am 12nn 4:30pm");
  });
});

describe("SpaceAndRadius", () => {
  const html = renderToStaticMarkup(createElement(SpaceAndRadius));

  it("shows exactly the seven spacing steps the project allows (AC-1)", () => {
    const steps = [...html.matchAll(/calc\(var\(--spacing\) \* (\d+)\)/g)].map((m) => Number(m[1]));
    expect(steps).toEqual([1, 2, 3, 4, 6, 8, 12]);
  });

  it("names the grid geometry tokens that the stylesheet defines (AC-7)", () => {
    for (const name of ["--row-h", "--col-time", "--col-court-min", "--dur-fast", "--dur-slow"]) {
      expect(html).toContain(`<code>${name}</code>`);
      expect(defined, `${name} is shown on /design but not defined in globals.css`).toContain(name);
    }
  });

  it("defines the radius tokens it paints with", () => {
    expect(defined).toContain("--radius");
    expect(defined).toContain("--radius-cell");
  });
});
