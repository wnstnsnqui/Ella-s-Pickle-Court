import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { VENUE_NAME, VENUE_TAGLINE } from "@/lib/venue";

/**
 * Spec 0003, AC-15 (Inter, self hosted through `next/font`).
 *
 * The root layout is a server component. Its element tree is inspected
 * rather than rendered: `<html>` and `<body>` are what matter.
 */

// `next/font/google` is a build time transform. Outside `next build` it must be
// stood in for; what matters here is that the layout asks for Inter and puts its
// variable on `<html>`.
const inter = vi.fn<(opts: unknown) => { variable: string; className: string }>(() => ({
  variable: "--font-inter",
  className: "inter",
}));
vi.mock("next/font/google", () => ({ Inter: (opts: unknown) => inter(opts) }));

const Toaster = () => null;
vi.mock("@/components/ui/sonner", () => ({ Toaster }));

vi.mock("./globals.css", () => ({}));

/** Walk down a tree of elements until one has the given type. */
function find(node: ReactNode, type: string): ReactElement<Record<string, unknown>> | null {
  if (!isValidElement(node)) return null;
  if (node.type === type) return node as ReactElement<Record<string, unknown>>;
  const children = (node.props as { children?: ReactNode }).children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const hit = find(child, type);
    if (hit) return hit;
  }
  return null;
}

async function renderTree() {
  const { default: RootLayout } = await import("./layout");
  return RootLayout({ children: "page", params: Promise.resolve({}) });
}

describe("RootLayout", () => {
  it("renders <html> with no theme attribute", async () => {
    const html = find(await renderTree(), "html");
    expect(html).not.toBeNull();
    expect(html!.props["data-theme"]).toBeUndefined();
    expect(html!.props.lang).toBe("en");
  });

  it("loads Inter through next/font, self hosted, and puts its variable on <html> (AC-15)", async () => {
    const html = find(await renderTree(), "html");
    expect(inter).toHaveBeenCalledWith(
      expect.objectContaining({ variable: "--font-inter", subsets: ["latin"] }),
    );
    expect(html!.props.className).toContain("--font-inter");
  });

  it("paints the body with the background and foreground tokens", async () => {
    const body = find(await renderTree(), "body");
    expect(body).not.toBeNull();
    expect(body!.props.className).toContain("bg-background");
    expect(body!.props.className).toContain("text-foreground");
    // The page and the one toaster the whole app shares sit straight inside
    // body; spec 0004 (revised) removed the identity provider that once
    // wrapped them.
    const [page, toaster] = body!.props.children as ReactNode[];
    expect(page).toBe("page");
    expect(isValidElement(toaster) && toaster.type).toBe(Toaster);
  });
});

describe("viewport", () => {
  it("declares light as the only colour scheme", async () => {
    const { viewport } = await import("./layout");
    expect(viewport.colorScheme).toBe("light");
  });

  it("gives the browser a theme colour", async () => {
    const { viewport } = await import("./layout");
    expect(viewport.themeColor).toBe("#fffbea");
  });
});

describe("metadata", () => {
  it("titles every page after the venue, from the one constant (AC-16)", async () => {
    const { metadata } = await import("./layout");
    const title = metadata.title as { default: string; template: string };
    expect(title.default).toContain(VENUE_NAME);
    expect(title.template).toContain(VENUE_NAME);
    expect(title.template).toContain("%s");
    expect(metadata.description).toBe(VENUE_TAGLINE);
  });

  it("sets an absolute base so the social card unfurls off localhost", async () => {
    const { metadata } = await import("./layout");
    expect(metadata.metadataBase).toBeInstanceOf(URL);
  });
});
