import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageHeading } from "./page-heading";

/**
 * Spec 0018, AC-12: settings, reports, staff accounts and your account open
 * with the landing's eyebrow, title and lede, at working size, under a round
 * "Back to the board" pill.
 */

const render = (props: Partial<Parameters<typeof PageHeading>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(PageHeading, {
      eyebrow: "Venue",
      title: "Settings",
      lede: "The courts and the hours the venue is open.",
      ...props,
    }),
  );

describe("PageHeading", () => {
  it("shows the eyebrow, the title as the page's h1, and the lede (AC-12)", () => {
    const html = render();
    expect(html).toMatch(/<p class="[^"]*uppercase[^"]*">Venue<\/p>/);
    expect(html).toMatch(/<h1 class="text-display[^"]*">Settings<\/h1>/);
    expect(html).toContain("The courts and the hours the venue is open.</p>");
  });

  it("uses the working display size, never the landing's fluid headline", () => {
    expect(render()).not.toContain("text-headline");
  });

  it("puts a round Back to the board link to /staff above the heading", () => {
    const html = render();
    const link = /<a[^>]*>[\s\S]*?<\/a>/.exec(html)?.[0] ?? "";
    expect(link).toContain('href="/staff"');
    expect(link).toContain("rounded-full");
    expect(link).toContain("Back to the board");
    expect(html.indexOf("Back to the board")).toBeLessThan(html.indexOf("<h1"));
  });

  it("hides the arrow from screen readers, so the link reads as its words", () => {
    expect(render()).toMatch(/<a[^>]*><svg[^>]*aria-hidden="true"/);
  });

  it("leaves the link out when asked", () => {
    expect(render({ back: false })).not.toContain("Back to the board");
  });

  it("leaves the lede out when there is none", () => {
    expect(render({ lede: undefined })).not.toContain("text-muted-foreground");
  });

  it("renders as an h3 when shown as a sample inside another page", () => {
    const html = render({ as: "h3" });
    expect(html).toContain("<h3");
    expect(html).not.toContain("<h1");
  });
});
