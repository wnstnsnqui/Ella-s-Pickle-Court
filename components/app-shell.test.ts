import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VENUE_NAME } from "@/lib/venue";

/**
 * Spec 0003, AC-10: one shell for both boards, with the wordmark, a toolbar slot,
 * and a staff slot that renders only for a signed in staff member.
 *
 * The shell is a server component that reads the session once through
 * `currentSession()` (spec 0004, revised), a boundary mocked here, and the
 * element it returns is rendered to static HTML.
 */

let signedIn = false;
vi.mock("@/lib/auth/session", () => ({
  currentSession: async () => (signedIn ? { user: { id: "user_1" } } : null),
}));

beforeEach(() => {
  signedIn = false;
});

async function render(props: {
  children?: ReactNode;
  toolbar?: ReactNode;
  staff?: ReactNode;
  className?: string;
}) {
  const { AppShell } = await import("./app-shell");
  const element = await AppShell({ children: props.children ?? "board", ...props });
  return renderToStaticMarkup(element);
}

describe("AppShell", () => {
  it("renders the wordmark, the content and the venue time footer (AC-10)", async () => {
    const html = await render({ children: createElement("p", null, "the board") });
    expect(html).toContain(VENUE_NAME.replace("'", "&#x27;"));
    expect(html).toContain("<p>the board</p>");
    expect(html).toContain("All times are venue time, Asia/Manila.");
  });

  it("puts the content inside a main landmark and the brand inside a header", async () => {
    const html = await render({});
    expect(html).toMatch(/<header[^>]*>[\s\S]*<\/header>\s*<main/);
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html).toMatch(/<footer/);
  });

  it("renders the toolbar strip only when a toolbar is given", async () => {
    const without = await render({});
    expect(without).not.toContain("toolbar-probe");

    const withToolbar = await render({
      toolbar: createElement("nav", { "data-probe": "toolbar-probe" }, "day nav"),
    });
    expect(withToolbar).toContain("toolbar-probe");
    // The toolbar sits inside the sticky header so it scrolls with the brand band.
    expect(withToolbar).toMatch(/<header[^>]*>[\s\S]*toolbar-probe[\s\S]*<\/header>/);
  });

  it("omits the staff control from the page source when nobody is signed in (AC-10)", async () => {
    signedIn = false;
    const html = await render({ staff: createElement("button", null, "Staff control") });
    expect(html).not.toContain("Staff control");
  });

  it("renders the staff control for a signed in staff member (AC-10)", async () => {
    signedIn = true;
    const html = await render({ staff: createElement("button", null, "Staff control") });
    expect(html).toContain("Staff control");
  });

  it("offers the staff sign in link only to a signed out visitor", async () => {
    const out = await render({});
    expect(out).toMatch(/<a[^>]*href="\/sign-in"[^>]*>Staff sign in<\/a>/);
    signedIn = true;
    const inside = await render({});
    expect(inside).not.toContain("Staff sign in");
  });

  it("carries Privacy and Terms links in the footer on every page (spec 0010, AC-3)", async () => {
    const html = await render({});
    const footer = html.match(/<footer[^>]*>[\s\S]*<\/footer>/)?.[0] ?? "";
    expect(footer).toMatch(/<a[^>]*href="\/privacy"[^>]*>Privacy<\/a>/);
    expect(footer).toMatch(/<a[^>]*href="\/terms"[^>]*>Terms<\/a>/);
  });

  it("merges an extra class onto main", async () => {
    const html = await render({ className: "board-main" });
    expect(html).toMatch(/<main[^>]*class="[^"]*board-main/);
  });
});
