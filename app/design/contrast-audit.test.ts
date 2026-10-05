import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContrastAudit } from "./contrast-audit";

/**
 * Spec 0003, AC-4, as spec 0018 AC-16 amends it: every colour pair meets WCAG
 * AA, measured in the browser. The
 * measuring needs a real stylesheet and `getComputedStyle`, so the ratios
 * themselves are `/check verify` work on `/design`. What can be pinned here
 * is that the component survives a server render, and that the pairs it measures
 * are tokens the stylesheet actually defines. A pair naming a missing token is
 * skipped silently by `measure`, so the table would say "all pairs pass" while
 * quietly measuring fewer of them.
 */

const here = new URL(".", import.meta.url);
const source = readFileSync(new URL("./contrast-audit.tsx", here), "utf8");
const css = readFileSync(new URL("../globals.css", here), "utf8");
const defined = new Set([...css.matchAll(/^\s*(--[a-z][a-z0-9-]*)\s*:/gm)].map((m) => m[1]));

describe("ContrastAudit", () => {
  it("renders a polite status on the server while nothing has been measured yet (AC-4)", () => {
    const html = renderToStaticMarkup(createElement(ContrastAudit));
    expect(html).toMatch(/<p[^>]*role="status"/);
    expect(html).toContain("Measuring every pair");
    expect(html).not.toContain("<table");
  });

  it("does not touch the document during render, so a server paint cannot crash", () => {
    expect(() => renderToStaticMarkup(createElement(ContrastAudit))).not.toThrow();
  });

  it("measures only tokens that app/globals.css defines (AC-4)", () => {
    const referenced = new Set(
      [...source.matchAll(/(?:fg|bg):\s*"(--[a-z][a-z0-9-]*)"/g)].map((m) => m[1]),
    );
    expect(referenced.size).toBeGreaterThan(0);
    for (const name of referenced) {
      expect(defined, `${name} is measured on /design but not defined in globals.css`).toContain(
        name,
      );
    }
  });

  it("measures every state role's text on its own fill (AC-4, AC-5, spec 0018 AC-16)", () => {
    for (const state of ["available", "booked", "unavailable", "outofhours", "selected"]) {
      expect(source).toMatch(new RegExp(`fg: "--state-${state}-fg",\\s*bg: "--state-${state}"`));
    }
  });

  it("no longer holds a tile's edge to the page, only Selected's to its fill (spec 0018, AC-16)", () => {
    for (const state of ["available", "booked", "unavailable", "outofhours"]) {
      expect(source).not.toContain(`"--state-${state}-border"`);
    }
    expect(source).toMatch(/fg: "--state-selected-border",\s*bg: "--state-selected"/);
  });

  it("measures the ink button and the header's glass at its worst, over ink (spec 0018, AC-16)", () => {
    expect(source).toMatch(/fg: "--mark-foreground", bg: "--mark"/);
    expect(source).toMatch(/fg: "--foreground",\s*bg: "--background",\s*glassOver: "--mark"/);
  });

  it("measures the ink focus look on the page, a card and the muted page (spec 0018, AC-1, AC-16)", () => {
    for (const bg of ["--background", "--card", "--muted"]) {
      expect(source).toMatch(
        new RegExp(`fg: "--foreground",\\s*bg: "${bg}",\\s*need: "boundary",\\s*what: "Ink focus`),
      );
    }
  });
});
