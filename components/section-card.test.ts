import { ClockIcon } from "@phosphor-icons/react/ssr";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SectionCard, SectionCardSkeleton } from "./section-card";

/**
 * Spec 0018, AC-12: each section of a working page is a white card whose
 * header is a duotone icon in the icon chip, a title and a line saying what
 * the section is for, with its action on the right. It has no hooks, so it is
 * called as a plain function, the way the server renders it.
 */

const render = (props: Partial<Parameters<typeof SectionCard>[0]> = {}) =>
  renderToStaticMarkup(
    SectionCard({
      id: "hours",
      icon: ClockIcon,
      title: "Opening hours",
      description: "The rows on the grid.",
      children: createElement("p", null, "the rows"),
      ...props,
    }),
  );

describe("SectionCard", () => {
  it("is a section named by its own heading (AC-12)", () => {
    const html = render();
    expect(html).toMatch(/^<section aria-labelledby="hours-heading"/);
    expect(html).toContain('<h2 id="hours-heading" class="text-title">Opening hours</h2>');
  });

  it("says what the section is for under the title", () => {
    expect(render()).toContain("The rows on the grid.</p>");
  });

  it("draws the icon duotone inside the chip, hidden from screen readers", () => {
    const html = render();
    expect(html).toMatch(/<span aria-hidden="true" class="chip-icon"><svg/);
  });

  it("puts the action after the heading, and the content after both", () => {
    const html = render({ action: createElement("button", { type: "button" }, "Add court") });
    const heading = html.indexOf("Opening hours");
    const action = html.indexOf("Add court");
    const content = html.indexOf("the rows");
    expect(heading).toBeLessThan(action);
    expect(action).toBeLessThan(content);
  });

  it("leaves out the description and the action when there are none", () => {
    const html = render({ description: undefined });
    expect(html).not.toContain("text-caption");
    expect(html).not.toContain("<button");
  });
});

describe("SectionCardSkeleton", () => {
  it("is hidden from screen readers and draws the rows asked for", () => {
    const html = renderToStaticMarkup(createElement(SectionCardSkeleton, { rows: 3 }));
    expect(html).toMatch(/^<div aria-hidden="true"/);
    expect(html.match(/rounded-2xl h-10/g)).toHaveLength(3);
  });
});
