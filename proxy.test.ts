import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0005, AC-1: `/staff` and everything under it is protected at the proxy,
 * so no response with customer data is built for a signed out visitor, while
 * the public board and the sign in pages stay open. Clerk's middleware is the
 * boundary and is faked so the guard callback can be called directly.
 */

const protect = vi.hoisted(() => vi.fn());
const clerkMiddleware = vi.hoisted(() =>
  vi.fn((handler: (auth: { protect: typeof protect }, request: unknown) => Promise<void>) => {
    return async (request: unknown) => {
      await handler({ protect }, request);
      return { marker: "clerk response" };
    };
  }),
);
vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware }));

const request = (pathname: string) => ({ nextUrl: { pathname } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
});

describe("proxy", () => {
  it.each(["/staff", "/staff/", "/staff/anything"])("protects %s (AC-1)", async (pathname) => {
    const proxy = (await import("./proxy")).default;
    await proxy(request(pathname) as never, {} as never);
    expect(protect).toHaveBeenCalledTimes(1);
  });

  it.each(["/", "/sign-in", "/sign-up", "/design", "/staffing", "/api/health"])(
    "leaves %s open",
    async (pathname) => {
      const proxy = (await import("./proxy")).default;
      await proxy(request(pathname) as never, {} as never);
      expect(protect).not.toHaveBeenCalled();
    },
  );

  it("passes the request through untouched in development with no Clerk key", async () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const proxy = (await import("./proxy")).default;
    const response = await proxy(request("/staff") as never, {} as never);
    // Clerk's handler is built at import but never run, so nothing is protected.
    expect(protect).not.toHaveBeenCalled();
    expect(response).not.toEqual({ marker: "clerk response" });
  });
});
