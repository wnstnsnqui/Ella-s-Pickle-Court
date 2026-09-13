import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VENUE_NAME, VENUE_TAGLINE } from "@/lib/venue";

/**
 * Spec 0003, AC-1 (the theme is stamped on `<html>` before first paint, and the
 * default follows the device) and AC-15 (Inter, self hosted through `next/font`).
 *
 * The root layout is an async server component. Its element tree is inspected
 * rather than rendered: `<html>` and `<body>` are what matter, and the providers
 * around them are covered by their own module.
 */

let cookieJar: Record<string, string> = {};
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name in cookieJar ? { name, value: cookieJar[name] } : undefined),
  }),
}));

// `next/font/google` is a build time transform. Outside `next build` it must be
// stood in for; what matters here is that the layout asks for Inter and puts its
// variable on `<html>`.
const inter = vi.fn<(opts: unknown) => { variable: string; className: string }>(() => ({
  variable: "--font-inter",
  className: "inter",
}));
vi.mock("next/font/google", () => ({ Inter: (opts: unknown) => inter(opts) }));

const Providers = ({ children }: { children: ReactNode }) => children;
vi.mock("./providers", () => ({ Providers }));

const Toaster = () => null;
vi.mock("@/components/ui/sonner", () => ({ Toaster }));

vi.mock("./globals.css", () => ({}));

beforeEach(() => {
  cookieJar = {};
});

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
  it("stamps nothing on <html> when no theme is pinned, so the device decides (AC-1)", async () => {
    const html = find(await renderTree(), "html");
    expect(html).not.toBeNull();
    expect(html!.props["data-theme"]).toBeUndefined();
    expect(html!.props.lang).toBe("en");
  });

  it.each(["light", "dark"] as const)(
    "stamps data-theme=%s on <html> from the cookie before first paint (AC-1)",
    async (theme) => {
      cookieJar = { theme };
      const html = find(await renderTree(), "html");
      expect(html!.props["data-theme"]).toBe(theme);
    },
  );

  it("treats a damaged cookie as following the device (AC-1)", async () => {
    cookieJar = { theme: "neon" };
    const html = find(await renderTree(), "html");
    expect(html!.props["data-theme"]).toBeUndefined();
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
    // Clerk's provider sits inside body (spec 0004), holding the page and the
    // one toaster the whole app shares.
    const providers = body!.props.children as ReactElement<{ children: ReactNode[] }>;
    expect(providers.type).toBe(Providers);
    const [page, toaster] = providers.props.children;
    expect(page).toBe("page");
    expect(isValidElement(toaster) && toaster.type).toBe(Toaster);
  });
});

describe("viewport", () => {
  it("declares both colour schemes so the browser paints the right ground before CSS (AC-1)", async () => {
    const { viewport } = await import("./layout");
    expect(viewport.colorScheme).toBe("light dark");
  });

  it("gives each scheme its own theme colour", async () => {
    const { viewport } = await import("./layout");
    const colors = viewport.themeColor as Array<{ media: string; color: string }>;
    expect(colors.map((c) => c.media)).toEqual([
      "(prefers-color-scheme: light)",
      "(prefers-color-scheme: dark)",
    ]);
    expect(new Set(colors.map((c) => c.color)).size).toBe(2);
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
