import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0004 (revised), AC-1 and AC-16: every auth page renders inside the app
 * shell with a heading, the card holding the form, and the fixed staff only
 * line under it.
 */

vi.mock("@/lib/auth/session", () => ({ currentSession: async () => null }));

let configured = true;
vi.mock("@/lib/env", () => ({
  get authConfigured() {
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
  it("renders the heading, the card and the staff only line inside the shell (AC-1, AC-16)", async () => {
    const { STAFF_ONLY_LINE } = await import("./auth-surface");
    const html = await render({
      title: "Sign in",
      lede: "A short word.",
      children: createElement("div", { "data-probe": "auth-form" }),
    });
    expect(html).toMatch(/<main[^>]*>[\s\S]*<h1[^>]*>Sign in<\/h1>/);
    expect(html).toContain('data-probe="auth-form"');
    expect(html).toContain(STAFF_ONLY_LINE);
  });

  it("explains itself instead of crashing when Better Auth is not configured", async () => {
    configured = false;
    const html = await render({
      title: "Sign in",
      lede: "A short word.",
      children: createElement("div", { "data-probe": "auth-form" }),
    });
    expect(html).not.toContain('data-probe="auth-form"');
    expect(html).toContain("Sign in is not set up yet");
  });
});
