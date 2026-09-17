import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VENUE_NAME } from "@/lib/venue";

/**
 * Spec 0003, AC-10: one shell for both boards, with the wordmark, a toolbar slot,
 * and a staff slot that renders only for a signed in staff member.
 *
 * The shell is an async server component that reads the theme cookie and asks
 * Clerk who is signed in. Both are boundaries, so both are mocked here and the
 * element it returns is rendered to static HTML.
 */

// What the request's cookie jar holds, set per test.
let cookieJar: Record<string, string> = {};
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name in cookieJar ? { name, value: cookieJar[name] } : undefined),
  }),
}));

// Clerk's `<Show>` stands in for the real gate: it renders its children for
// whichever side (`signed-in` or `signed-out`) matches the test's state.
let signedIn = false;
vi.mock("@clerk/nextjs", () => ({
  Show: ({ when, children }: { when: string; children: ReactNode }) => {
    const matches = when === "signed-in" ? signedIn : when === "signed-out" ? !signedIn : false;
    return matches ? children : null;
  },
}));

// Whether Clerk keys exist, set per test.
let configured = true;
vi.mock("@/lib/env", () => ({
  get clerkConfigured() {
    return configured;
  },
}));

beforeEach(() => {
  cookieJar = {};
  signedIn = false;
  configured = true;
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

  it("still shows the theme toggle to a signed out visitor even with a staff slot in play", async () => {
    signedIn = false;
    const html = await render({ staff: createElement("button", null, "Staff control") });
    expect(html).toContain('aria-label="Theme: Follows your device. Switch to light"');
  });

  it("never asks Clerk about the staff slot when Clerk is not configured (AC-10)", async () => {
    signedIn = true;
    configured = false;
    const html = await render({ staff: createElement("button", null, "Staff control") });
    expect(html).not.toContain("Staff control");
  });

  it("seeds the theme toggle from the cookie so the first paint is right (AC-1)", async () => {
    cookieJar = { theme: "dark" };
    const html = await render({});
    expect(html).toContain('aria-label="Theme: Dark. Switch to follows your device"');
  });

  it("falls back to following the device when the cookie is missing or bad (AC-1)", async () => {
    const missing = await render({});
    expect(missing).toContain('aria-label="Theme: Follows your device. Switch to light"');

    cookieJar = { theme: "purple" };
    const bad = await render({});
    expect(bad).toContain('aria-label="Theme: Follows your device. Switch to light"');
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
