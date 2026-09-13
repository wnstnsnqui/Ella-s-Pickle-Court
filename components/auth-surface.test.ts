import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0004, AC-1 and AC-10: both auth pages render inside the app shell with
 * a heading, the Clerk card, and the fixed staff only line beside it.
 */

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@clerk/nextjs", () => ({
  Show: ({ children }: { children: ReactNode }) => children,
}));

let configured = true;
vi.mock("@/lib/env", () => ({
  get clerkConfigured() {
    return configured;
  },
}));

async function render(props: { title: string; lede: string; children?: ReactNode }) {
  const { AppShell } = await import("./app-shell");
  const { AuthSurface } = await import("./auth-surface");
  // The surface returns a shell element; the shell itself is async, so resolve it.
  const surface = AuthSurface({ children: null, ...props });
  const shell = await AppShell(surface.props as Parameters<typeof AppShell>[0]);
  return renderToStaticMarkup(shell);
}

beforeEach(() => {
  configured = true;
});

describe("AuthSurface", () => {
  it("renders the heading, the card and the staff only line inside the shell (AC-1, AC-10)", async () => {
    const { STAFF_ONLY_LINE } = await import("./auth-surface");
    const html = await render({
      title: "Sign in",
      lede: "A short word.",
      children: createElement("div", { "data-probe": "clerk-card" }),
    });
    expect(html).toMatch(/<main[^>]*>[\s\S]*<h1[^>]*>Sign in<\/h1>/);
    expect(html).toContain('data-probe="clerk-card"');
    expect(html).toContain(STAFF_ONLY_LINE);
  });

  it("explains itself instead of crashing when Clerk keys are missing", async () => {
    configured = false;
    const html = await render({
      title: "Sign in",
      lede: "A short word.",
      children: createElement("div", { "data-probe": "clerk-card" }),
    });
    expect(html).not.toContain('data-probe="clerk-card"');
    expect(html).toContain("Sign in is not set up yet");
  });
});
