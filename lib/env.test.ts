import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0001's Configuration section and architecture rule 1.
 *
 * The rule this file guards hardest: the service role key must never be reachable
 * from application code. A regression there is a real security hole, not a lint
 * complaint, so it gets a test rather than a comment.
 */

const KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_VENUE_TIMEZONE",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_DATABASE_URL",
  "BOOTSTRAP_OWNER_USERNAME",
] as const;

const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
  vi.resetModules();
});

async function loadEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("./env");
}

describe("publicEnv", () => {
  it("returns the Supabase URL and public key when both are set", async () => {
    const { publicEnv } = await loadEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
    });

    expect(publicEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
    });
  });

  it("throws when the Supabase URL is missing, rather than returning undefined", async () => {
    const { publicEnv } = await loadEnv({
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
    });
    expect(() => publicEnv()).toThrow();
  });

  it("throws when the Supabase URL is not a URL", async () => {
    const { publicEnv } = await loadEnv({
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
    });
    expect(() => publicEnv()).toThrow(/must be your Supabase project URL/);
  });

  it("throws when the public key is an empty string", async () => {
    const { publicEnv } = await loadEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    });
    expect(() => publicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY is missing/);
  });

  it("validates lazily, so importing the module with no config does not throw", async () => {
    // `next build` has to succeed on a machine with no credentials.
    await expect(
      loadEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined }),
    ).resolves.toBeDefined();
  });

  it("never exposes the service role key (architecture rule 1)", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-must-not-leak";
    const env = await loadEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
    });

    expect(JSON.stringify(env.publicEnv())).not.toContain("service-role-must-not-leak");
    expect(Object.keys(env)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
});

describe("VENUE_TIMEZONE", () => {
  it("defaults to Asia/Manila when unset", async () => {
    const { VENUE_TIMEZONE } = await loadEnv({ NEXT_PUBLIC_VENUE_TIMEZONE: undefined });
    expect(VENUE_TIMEZONE).toBe("Asia/Manila");
  });

  it("defaults to Asia/Manila when set to an empty string", async () => {
    const { VENUE_TIMEZONE } = await loadEnv({ NEXT_PUBLIC_VENUE_TIMEZONE: "" });
    expect(VENUE_TIMEZONE).toBe("Asia/Manila");
  });

  it("uses the configured value when one is set", async () => {
    const { VENUE_TIMEZONE } = await loadEnv({ NEXT_PUBLIC_VENUE_TIMEZONE: "UTC" });
    expect(VENUE_TIMEZONE).toBe("UTC");
  });
});

describe("authConfigured", () => {
  it("is true when BETTER_AUTH_SECRET is present", async () => {
    const { authConfigured } = await loadEnv({ BETTER_AUTH_SECRET: "x".repeat(32) });
    expect(authConfigured).toBe(true);
  });

  it("is false when BETTER_AUTH_SECRET is absent", async () => {
    const { authConfigured } = await loadEnv({ BETTER_AUTH_SECRET: undefined });
    expect(authConfigured).toBe(false);
  });
});

describe("serverEnv", () => {
  const complete = {
    BETTER_AUTH_SECRET: "s".repeat(32),
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_DATABASE_URL: "postgresql://better_auth_app:pw@db.example:6543/postgres",
    BOOTSTRAP_OWNER_USERNAME: "ella",
  };

  it("returns the Better Auth values (spec 0004)", async () => {
    const { serverEnv } = await loadEnv(complete);
    expect(serverEnv()).toEqual(complete);
  });

  it("refuses a missing bootstrap username, naming it", async () => {
    const { serverEnv } = await loadEnv({ ...complete, BOOTSTRAP_OWNER_USERNAME: undefined });
    expect(() => serverEnv()).toThrow(/BOOTSTRAP_OWNER_USERNAME/);
  });

  it("refuses a short secret, naming it", async () => {
    const { serverEnv } = await loadEnv({ ...complete, BETTER_AUTH_SECRET: "short" });
    expect(() => serverEnv()).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("refuses a missing database URL, naming it", async () => {
    const { serverEnv } = await loadEnv({ ...complete, BETTER_AUTH_DATABASE_URL: undefined });
    expect(() => serverEnv()).toThrow(/BETTER_AUTH_DATABASE_URL/);
  });

  it("never exposes SUPABASE_JWT_SECRET or the service role key (invariant 6, rule 1)", async () => {
    const { serverEnv } = await loadEnv(complete);
    expect(JSON.stringify(serverEnv())).not.toMatch(/SUPABASE_JWT_SECRET|SERVICE_ROLE/);
  });
});
