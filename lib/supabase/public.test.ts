import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Architecture rules 4 and 10: the public board reads with the anon key and no
 * session token. If this client ever gains a token, the read only guarantee on the
 * public board quietly disappears, which is exactly the kind of regression a
 * passing feature test would not notice.
 */

type ClientOptions = {
  accessToken?: () => Promise<string | null>;
  auth?: { persistSession?: boolean; autoRefreshToken?: boolean };
};

const createClient = vi.hoisted(() =>
  vi.fn<(url: string, key: string, options?: ClientOptions) => { marker: string }>(() => ({
    marker: "client",
  })),
);
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const { publicSupabase } = await import("./public");

/** The options object the client was built with. */
function optionsFromCall(index = 0): ClientOptions {
  return createClient.mock.calls[index]?.[2] ?? {};
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_test";
});

describe("publicSupabase", () => {
  it("builds a client from the project URL and the anon key", () => {
    publicSupabase();

    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_test",
      expect.anything(),
    );
  });

  it("carries no session token, so Postgres sees an anonymous caller", () => {
    publicSupabase();

    expect(optionsFromCall()).not.toHaveProperty("accessToken");
  });

  it("keeps no session, so one reader's state cannot bleed into another's", () => {
    publicSupabase();

    const options = optionsFromCall();
    expect(options.auth?.persistSession).toBe(false);
    expect(options.auth?.autoRefreshToken).toBe(false);
  });

  it("never receives the service role key (architecture rule 1)", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-must-not-leak";

    publicSupabase();

    expect(JSON.stringify(createClient.mock.calls[0])).not.toContain("service-role-must-not-leak");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("throws when Supabase is not configured, instead of building a broken client", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => publicSupabase()).toThrow();
  });
});
