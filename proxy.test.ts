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

const request = (pathname: string, headers: Record<string, string> = {}, method = "GET") => ({
  nextUrl: { pathname },
  method,
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
});

describe("proxy", () => {
  it.each(["/staff", "/staff/", "/staff/anything", "/staff/reports", "/staff/settings"])(
    "protects %s (AC-1)",
    async (pathname) => {
      const proxy = (await import("./proxy")).default;
      await proxy(request(pathname) as never, {} as never);
      expect(protect).toHaveBeenCalledTimes(1);
    },
  );

  /**
   * Spec 0008, AC-9: `auth.protect()` answers an unauthenticated request with
   * a redirect or Clerk's own 404, never the CSV route's own typed 401/403.
   * The route is carved out of the blanket `/staff/` protection, but still
   * has to sit inside `config.matcher` so Clerk middleware runs at all and
   * the route's own `auth()` call has context to read.
   */
  it("runs Clerk middleware but skips auth.protect() for the usage CSV route (AC-9)", async () => {
    const proxy = (await import("./proxy")).default;
    const response = await proxy(request("/staff/reports/usage.csv") as never, {} as never);
    expect(protect).not.toHaveBeenCalled();
    expect(response).toEqual({ marker: "clerk response" });
  });

  it("keeps every other path under /staff protected, including one that also ends .csv", async () => {
    const proxy = (await import("./proxy")).default;
    await proxy(request("/staff/reports/usage.csv/") as never, {} as never);
    expect(protect).toHaveBeenCalledTimes(1);
  });

  it("still matches /staff paths in config.matcher despite the static file extension exclusion", async () => {
    const { config } = await import("./proxy");
    expect(config.matcher).toContain("/staff(.*)");
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

  /**
   * Spec 0006, AC-8: the two public reads are capped per forwarded address,
   * before Clerk runs; a request with no address is never limited.
   */
  describe("public read limit", () => {
    const from = (address: string, pathname = "/") =>
      request(pathname, { "x-forwarded-for": address }) as never;

    it("answers 429 with Retry-After on the 61st read from one address inside a minute", async () => {
      const { default: proxy, PUBLIC_READ_LIMIT } = await import("./proxy");
      for (let i = 0; i < PUBLIC_READ_LIMIT; i += 1) {
        const response = await proxy(
          from("203.0.113.9", i % 2 ? "/" : "/api/schedule"),
          {} as never,
        );
        expect(response).toEqual({ marker: "clerk response" });
      }
      const refused = (await proxy(from("203.0.113.9"), {} as never)) as Response;
      expect(refused.status).toBe(429);
      expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
      expect(refused.headers.get("Content-Type")).toContain("text/plain");
      expect(await refused.text()).toMatch(/Too many requests/);
      // Clerk never ran for the refused request.
      expect(clerkMiddleware.mock.results[0]?.value).toBeDefined();
    });

    it("answers the endpoint with a JSON error body", async () => {
      const { default: proxy, PUBLIC_READ_LIMIT } = await import("./proxy");
      for (let i = 0; i < PUBLIC_READ_LIMIT; i += 1) {
        await proxy(from("203.0.113.10", "/api/schedule"), {} as never);
      }
      const refused = (await proxy(from("203.0.113.10", "/api/schedule"), {} as never)) as Response;
      expect(refused.status).toBe(429);
      expect(await refused.json()).toMatchObject({ ok: false, error: { kind: "rate_limited" } });
    });

    it("keeps a second address on its own bucket", async () => {
      const { default: proxy, PUBLIC_READ_LIMIT } = await import("./proxy");
      for (let i = 0; i <= PUBLIC_READ_LIMIT; i += 1)
        await proxy(from("203.0.113.11"), {} as never);
      const other = await proxy(from("203.0.113.12"), {} as never);
      expect(other).toEqual({ marker: "clerk response" });
    });

    it("never limits a request with no forwarded address", async () => {
      const { default: proxy, PUBLIC_READ_LIMIT } = await import("./proxy");
      for (let i = 0; i <= PUBLIC_READ_LIMIT + 5; i += 1) {
        const response = await proxy(request("/") as never, {} as never);
        expect(response).toEqual({ marker: "clerk response" });
      }
    });

    it("leaves the staff board and the health endpoint unlimited", async () => {
      const { default: proxy, PUBLIC_READ_LIMIT } = await import("./proxy");
      for (let i = 0; i <= PUBLIC_READ_LIMIT + 5; i += 1) {
        await proxy(from("203.0.113.13", "/api/health"), {} as never);
        const response = await proxy(from("203.0.113.13", "/staff"), {} as never);
        expect(response).toEqual({ marker: "clerk response" });
      }
    });
  });
});
