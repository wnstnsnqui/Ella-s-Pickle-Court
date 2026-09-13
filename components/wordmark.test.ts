import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VENUE_INITIAL, VENUE_NAME } from "@/lib/venue";

import { Wordmark } from "./wordmark";

/**
 * Spec 0003, AC-10 (the shell carries the venue wordmark) and AC-16 (no image
 * assets: the mark is a letter set in type, and the name comes from one constant).
 */

describe("Wordmark", () => {
  it("links home by default (AC-10)", () => {
    const html = renderToStaticMarkup(createElement(Wordmark));
    expect(html).toMatch(/<a[^>]*href="\/"/);
  });

  it("accepts another destination", () => {
    const html = renderToStaticMarkup(createElement(Wordmark, { href: "/design" }));
    expect(html).toMatch(/<a[^>]*href="\/design"/);
  });

  it("shows the venue name from lib/venue, so one constant renames everything (AC-16)", () => {
    const html = renderToStaticMarkup(createElement(Wordmark));
    expect(html).toContain(VENUE_NAME.replace("'", "&#x27;"));
  });

  it("draws the mark as a letter with no image request (AC-16)", () => {
    const html = renderToStaticMarkup(createElement(Wordmark));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<svg");
    expect(html).toContain(`>${VENUE_INITIAL}<`);
  });

  it("hides the decorative letter so the link is named by the venue only", () => {
    const html = renderToStaticMarkup(createElement(Wordmark));
    expect(html).toMatch(new RegExp(`<span[^>]*aria-hidden="true"[^>]*>${VENUE_INITIAL}<`));
  });

  it("merges an extra class onto the inner layout", () => {
    const html = renderToStaticMarkup(createElement(Wordmark, { className: "extra-class" }));
    expect(html).toContain("extra-class");
  });
});
