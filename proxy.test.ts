import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0005, AC-1 and spec 0004 (revised), AC-10: `/staff` and everything
 * under it is the courtesy door. A request with no Better Auth session cookie
 * is sent to `/sign-in?redirect=<path>` before any response with customer data
 * is built, while the public board, the auth pages and `/api/auth/*` stay
 * open. Only the cookie's presence is checked here; the page verifies it.
 */

const SESSION_COOKIE = "better-auth.session_token=abc";

const request = (
  pathname: string,
  headers: Record<string, string> = {},
  method = "GET",
  search = "",
) => {
  const url = new URL(`http://localhost:3000${pathname}${search}`);
  const nextUrl = Object.assign(url, { clone: () => new URL(url.toString()) });
  return {
    nextUrl,
    url: url.toString(),
    method,
    headers: new Headers(headers),
  };
};

beforeEach(() => {
  vi.resetModules();
});

/** Where a redirect response points, or null for a pass through. */
function redirectedTo(response: unknown): string | null {
  const location = (response as Response).headers?.get("location");
  return location ? new URL(location).pathname + new URL(location).search : null;
}

describe("proxy", () => {
  it.each(["/staff", "/staff/", "/staff/anything", "/staff/reports", "/staff/settings"])(
    "sends a signed out visitor from %s to /sign-in with the path carried (AC-10)",
    async (pathname) => {
      const proxy = (await import("./proxy")).default;
      const response = await proxy(request(pathname) as never);
      expect(redirectedTo(response)).toBe(`/sign-in?redirect=${encodeURIComponent(pathname)}`);
    },
  );

  it("carries the query string along with the path", async () => {
    const proxy = (await import("./proxy")).default;
    const response = await proxy(request("/staff", {}, "GET", "?date=2026-09-20") as never);
    expect(redirectedTo(response)).toBe(
      `/sign-in?redirect=${encodeURIComponent("/staff?date=2026-09-20")}`,
    );
  });

  it("lets a request with a session cookie through to the page", async () => {
    const proxy = (await import("./proxy")).default;
    const response = await proxy(request("/staff", { cookie: SESSION_COOKIE }) as never);
    expect(redirectedTo(response)).toBeNull();
  });

  it("accepts the secure prefixed cookie production sets", async () => {
    const proxy = (await import("./proxy")).default;
    const response = await proxy(
      request("/staff", { cookie: "__Secure-better-auth.session_token=abc" }) as never,
    );
    expect(redirectedTo(response)).toBeNull();
  });

  /**
   * Spec 0008, AC-9: a redirect is never the CSV route's own typed 401/403,
   * so the route is carved out and answers its own door.
   */
  it("skips the redirect for the usage CSV route (AC-9)", async () => {
    const proxy = (await import("./proxy")).default;
    const response = await proxy(request("/staff/reports/usage.csv") as never);
    expect(redirectedTo(response)).toBeNull();
  });

  it("keeps every other path under /staff protected, including one that also ends .csv", async () => {
    const proxy = (await import("./proxy")).default;
    const response = await proxy(request("/staff/reports/usage.csv/") as never);
    expect(redirectedTo(response)).not.toBeNull();
  });

  it("still matches /staff paths in config.matcher despite the static file extension exclusion", async () => {
    const { config } = await import("./proxy");
    expect(config.matcher).toContain("/staff(.*)");
  });

  it.each([
    "/",
    "/sign-in",
    "/sign-up",
    "/sign-up/abc",
    "/reset/abc",
    "/design",
    "/staffing",
    "/api/health",
    "/api/auth/sign-in/email",
  ])("leaves %s open", async (pathname) => {
    const proxy = (await import("./proxy")).default;
    const response = await proxy(request(pathname) as never);
    expect(redirectedTo(response)).toBeNull();
  });

  /**
   * Spec 0009, AC-10: PostHog's ingest rewrite must reach `next.config.ts`
   * untouched by the door or the public read limiter.
   */
  it("leaves /ingest open even from an address already over the public read limit (AC-10)", async () => {
    const { default: proxy, PUBLIC_READ_LIMIT } = await import("./proxy");
    const address = "203.0.113.20";
    for (let i = 0; i <= PUBLIC_READ_LIMIT; i += 1) {
      await proxy(request("/", { "x-forwarded-for": address }) as never);
    }
    const ingest = (await proxy(
      request("/ingest/e/", { "x-forwarded-for": address }, "POST") as never,
    )) as Response;
    expect(ingest.status).not.toBe(429);
  });

  /**
   * Spec 0006, AC-8: the two public reads are capped per forwarded address;
   * a request with no address is never limited. Spec 0004, AC-14: Better
   * Auth's own endpoints are never seen by this limiter.
   */
  describe("public read limit", () => {
    const from = (address: string, pathname = "/") =>
      request(pathname, { "x-forwarded-for": address }) as never;

    it("answers 429 with Retry-After on the 61st read from one address inside a minute", async () => {
      const { default: proxy, PUBLIC_READ_LIMIT } = await import("./proxy");
      for (let i = 0; i < PUBLIC_READ_LIMIT; i += 1) {
        const response = (await proxy(
          from("203.0.113.9", i % 2 ? "/" : "/api/schedule"),
        )) as Response;
        expect(response.status).not.toBe(429);
      }
      const refused = (await proxy(from("203.0.113.9"))) as Response;
      expect(refused.status).toBe(429);
      expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
      expect(refused.headers.get("Content-Type")).toContain("text/plain");
      expect(await refused.text()).toMatch(/Too many requests/);
    });

    it("answers the endpoint with a JSON error body", async () => {
      const { default: proxy, PUBLIC_READ_LIMIT } = await import("./proxy");
      for (let i = 0; i < PUBLIC_READ_LIMIT; i += 1) {
        await proxy(from("203.0.113.10", "/api/schedule"));
      }
      const refused = (await proxy(from("203.0.113.10", "/api/schedule"))) as Response;
      expect(refused.status).toBe(429);
      expect(await refused.json()).toMatchObject({ ok: false, error: { kind: "rate_limited" } });
    });

    it("keeps a second address on its own bucket", async () => {
      const { default: proxy, PUBLIC_READ_LIMIT } = await import("./proxy");
      for (let i = 0; i <= PUBLIC_READ_LIMIT; i += 1) await proxy(from("203.0.113.11"));
      const other = (await proxy(from("203.0.113.12"))) as Response;
      expect(other.status).not.toBe(429);
    });

    it("never limits a request with no forwarded address", async () => {
      const { default: proxy, PUBLIC_READ_LIMIT } = await import("./proxy");
      for (let i = 0; i <= PUBLIC_READ_LIMIT + 5; i += 1) {
        const response = (await proxy(request("/") as never)) as Response;
        expect(response.status).not.toBe(429);
      }
    });

    it("leaves the staff board, the health endpoint and Better Auth unlimited (AC-14)", async () => {
      const { default: proxy, PUBLIC_READ_LIMIT } = await import("./proxy");
      for (let i = 0; i <= PUBLIC_READ_LIMIT + 5; i += 1) {
        const health = (await proxy(from("203.0.113.13", "/api/health"))) as Response;
        expect(health.status).not.toBe(429);
        const auth = (await proxy(from("203.0.113.13", "/api/auth/sign-in/email"))) as Response;
        expect(auth.status).not.toBe(429);
        const staff = (await proxy(from("203.0.113.13", "/staff"))) as Response;
        expect(staff.status).not.toBe(429);
      }
    });
  });
});
