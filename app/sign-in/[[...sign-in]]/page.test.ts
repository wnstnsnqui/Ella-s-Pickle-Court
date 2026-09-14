import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0004, AC-4 and AC-10: a signed in visitor is sent back to the board, and
 * the page is kept out of search engines.
 */

const auth = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
);

vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@clerk/nextjs", () => ({ SignIn: () => null, SignUp: () => null }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/auth-surface", () => ({ AuthSurface: () => null }));
vi.mock("@/lib/env", () => ({ clerkConfigured: true }));

beforeEach(() => vi.clearAllMocks());

describe("the auth pages", () => {
  for (const [name, load] of [
    ["/sign-in", () => import("./page")],
    ["/sign-up", () => import("../../sign-up/[[...sign-up]]/page")],
  ] as const) {
    it(`${name} sends a signed in visitor to /staff (AC-4, spec 0005 AC-1)`, async () => {
      auth.mockResolvedValue({ isAuthenticated: true });
      const page = (await load()).default;
      await expect(page()).rejects.toThrow("NEXT_REDIRECT /staff");
    });

    it(`${name} renders for a signed out visitor`, async () => {
      auth.mockResolvedValue({ isAuthenticated: false });
      const page = (await load()).default;
      await expect(page()).resolves.toBeTruthy();
      expect(redirect).not.toHaveBeenCalled();
    });

    it(`${name} is noindex (AC-10)`, async () => {
      const { metadata } = await load();
      expect(metadata.robots).toEqual({ index: false, follow: false });
    });
  }
});
