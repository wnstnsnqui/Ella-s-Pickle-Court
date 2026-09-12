import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0001's Health and uptime row: a board whose whole value is being current is
 * worthless if it dies quietly. This endpoint is what an uptime ping watches, so
 * it has to report the difference between healthy, unreachable and unconfigured,
 * and it must never throw its way into a blank 500.
 */

const publicSupabase = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/public", () => ({ publicSupabase }));

const { GET } = await import("./route");

/** A stand in for the Supabase query builder, resolving to whatever we hand it. */
function supabaseReturning(result: { error: unknown }) {
  return {
    from: () => ({ select: () => ({ limit: () => Promise.resolve(result) }) }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/health", () => {
  it("reports ok with HTTP 200 when the database answers", async () => {
    publicSupabase.mockReturnValue(supabaseReturning({ error: null }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.database).toBe("ok");
  });

  it("reports degraded with HTTP 503 when the database returns an error", async () => {
    publicSupabase.mockReturnValue(supabaseReturning({ error: { message: "connection refused" } }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.database).toBe("unreachable");
  });

  it("reports unconfigured rather than throwing when Supabase env values are missing", async () => {
    publicSupabase.mockImplementation(() => {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL must be your Supabase project URL.");
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.database).toBe("unconfigured");
  });

  it("always carries a UTC timestamp, so a stale cached answer is detectable", async () => {
    publicSupabase.mockReturnValue(supabaseReturning({ error: null }));

    const body = await (await GET()).json();

    expect(body.time).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  });

  it("leaks no credentials in the response body", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-must-not-leak";
    publicSupabase.mockReturnValue(supabaseReturning({ error: null }));

    const raw = await (await GET()).text();

    expect(raw).not.toContain("service-role-must-not-leak");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
});
