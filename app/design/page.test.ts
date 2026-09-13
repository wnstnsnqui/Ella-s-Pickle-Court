import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/app-shell";

import DesignPage, { dynamic, metadata } from "./page";

/**
 * Spec 0003, AC-3: `/design` renders for anybody, is closed to search engines, and
 * shows every token, component and cell state in both themes.
 *
 * The page is a server component whose shell reads cookies and asks Clerk who is
 * signed in. Those are boundaries: the shell has its own suite, so here the page's
 * element tree is inspected for what it hands the shell, and everything inside the
 * shell is rendered to static HTML.
 */

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@clerk/nextjs", () => ({ Show: () => null }));

type Props = { children?: ReactNode; toolbar?: ReactNode; staff?: ReactNode };

/** The `<AppShell>` element the page renders, with its props. */
function shellOf(tree: ReactNode): ReactElement<Props> {
  if (!isValidElement(tree) || tree.type !== AppShell) {
    throw new Error("the design page no longer renders inside AppShell");
  }
  return tree as ReactElement<Props>;
}

describe("/design route config", () => {
  it("is hidden from search engines but open to anybody (AC-3)", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("renders per request, never cached (AC-3)", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("titles itself so the layout template reads Design system · venue", () => {
    expect(metadata.title).toBe("Design system");
  });
});

describe("DesignPage", () => {
  const shell = shellOf(DesignPage());

  it("gives the shell a toolbar with day navigation and the live indicator (AC-10)", () => {
    const toolbar = renderToStaticMarkup(shell.props.toolbar as ReactElement);
    expect(toolbar).toContain('aria-label="Previous day"');
    expect(toolbar).toContain('aria-label="Next day"');
    expect(toolbar).toMatch(/role="status"[^>]*aria-live="polite"/);
  });

  it("gives the shell a staff control so the signed in gate has something to show (AC-10)", () => {
    const staff = renderToStaticMarkup(shell.props.staff as ReactElement);
    expect(staff).toMatch(/<button[^>]*>Staff control<\/button>/);
  });

  it("renders every section the spec promises, each labelled by its heading (AC-3)", () => {
    const html = renderToStaticMarkup(shell.props.children as ReactElement);
    for (const id of [
      "contrast",
      "color",
      "type",
      "space",
      "cells",
      "legend",
      "grid",
      "live",
      "components",
    ]) {
      expect(html).toMatch(new RegExp(`<section id="${id}" aria-labelledby="${id}-title"`));
      expect(html).toMatch(new RegExp(`<h2 id="${id}-title"`));
    }
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("shows the seven cell states with their icons in the gallery (AC-5)", () => {
    const html = renderToStaticMarkup(shell.props.children as ReactElement);
    for (const state of ["Available", "Booked", "Unavailable"]) {
      expect(html).toContain(state);
    }
    expect(html.match(/<svg/g)?.length ?? 0).toBeGreaterThan(7);
  });

  it("mounts no toaster of its own; the root layout carries the one toaster (AC-14)", () => {
    const root = DesignPage();
    expect(isValidElement(root) && root.type).toBe(AppShell);
  });
});
