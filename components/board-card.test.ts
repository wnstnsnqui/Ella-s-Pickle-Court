import { CompassIcon } from "@phosphor-icons/react/ssr";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BoardCard, BoardPageSkeleton, ClosedDayPanel } from "./board-card";
import { NAV_PILL } from "./nav-pill";
import { NoticeCard } from "./notice-card";

/**
 * Spec 0018: the board's white card and its closed day panel (AC-5), the
 * board page skeleton, the notice card a page shows a message in (AC-13),
 * and the header's staff link pill (AC-3). The cards have no hooks, so they are
 * called as plain functions, the way the server renders them.
 */

describe("BoardCard", () => {
  it("puts the header above the board (AC-5)", () => {
    const html = renderToStaticMarkup(
      BoardCard({ header: createElement("h2", null, "Tue 6 Oct"), children: "the grid" }),
    );
    expect(html).toMatch(/^<div class="surface-card[^"]*"><h2>Tue 6 Oct<\/h2>the grid<\/div>$/);
  });
});

describe("ClosedDayPanel", () => {
  it("says the day is closed, as the landing says it (AC-5)", () => {
    const html = renderToStaticMarkup(createElement(ClosedDayPanel));
    expect(html.replace(/<[^>]+>/g, "")).toBe("Closed all day. The venue is not open on this day.");
  });

  it("keeps the staff action under the words", () => {
    const html = renderToStaticMarkup(
      createElement(ClosedDayPanel, {
        action: createElement("button", { type: "button" }, "Add booking"),
      }),
    );
    expect(html).toMatch(/<\/p><button type="button">Add booking<\/button><\/div>$/);
  });
});

describe("BoardPageSkeleton", () => {
  it("is hidden from screen readers", () => {
    expect(renderToStaticMarkup(createElement(BoardPageSkeleton))).toMatch(
      /^<div aria-hidden="true"/,
    );
  });

  it("holds the summary card's place on staff, so the grid does not jump when it arrives", () => {
    const staff = renderToStaticMarkup(createElement(BoardPageSkeleton, { summary: true }));
    const board = renderToStaticMarkup(createElement(BoardPageSkeleton));
    expect(staff).toContain("lg:grid-cols-[minmax(0,1fr)_20rem]");
    expect(board).not.toContain("20rem");
  });
});

describe("NoticeCard", () => {
  it("shows the title and the message in one card (AC-13)", () => {
    const html = renderToStaticMarkup(
      NoticeCard({
        icon: CompassIcon,
        title: "Page not found",
        children: "That page doesn't exist.",
      }),
    );
    expect(html).toContain("surface-card");
    expect(html).toContain("Page not found");
    expect(html).toContain("That page doesn&#x27;t exist.");
  });

  it("hides its icon from screen readers", () => {
    const html = renderToStaticMarkup(
      NoticeCard({ icon: CompassIcon, title: "Page not found", children: "gone" }),
    );
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });
});

describe("NAV_PILL", () => {
  it("is a round pill in ink text with press feedback (AC-3, AC-16)", () => {
    const classes = NAV_PILL.split(" ");
    expect(classes).toEqual(expect.arrayContaining(["rounded-full", "text-foreground", "press"]));
    expect(classes).not.toContain("text-muted-foreground");
  });
});
