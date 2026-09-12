import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Architecture rules 1, 2 and 10: the staff client carries the signed in staff
 * member's Clerk token so row level security can decide what they may do, and it
 * is built fresh per request because it belongs to one particular person.
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
const auth = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@clerk/nextjs/server", () => ({ auth }));

const { staffSupabase } = await import("./staff");

/** The `accessToken` callback the client was built with. */
function accessTokenFromCall(index = 0): () => Promise<string | null> {
  const accessToken = createClient.mock.calls[index]?.[2]?.accessToken;
  if (!accessToken) throw new Error("the staff client was built without an accessToken callback");
  return accessToken;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_test";
});

describe("staffSupabase", () => {
  it("uses the anon key, not a privileged one, and lets the token carry identity", () => {
    staffSupabase();

    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_test",
      expect.anything(),
    );
  });

  it("supplies the caller's Clerk token through the accessToken callback", async () => {
    const getToken = vi.fn().mockResolvedValue("clerk-session-token");
    auth.mockResolvedValue({ getToken });

    staffSupabase();

    expect(await accessTokenFromCall()()).toBe("clerk-session-token");
    expect(getToken).toHaveBeenCalled();
  });

  it("reads the token per call, so a refreshed Clerk token is picked up (rule 12)", async () => {
    const getToken = vi
      .fn()
      .mockResolvedValueOnce("first-token")
      .mockResolvedValueOnce("second-token");
    auth.mockResolvedValue({ getToken });

    staffSupabase();
    const accessToken = accessTokenFromCall();

    expect(await accessToken()).toBe("first-token");
    expect(await accessToken()).toBe("second-token");
  });

  it("builds a new client on every call, never a module level singleton", () => {
    staffSupabase();
    staffSupabase();

    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("never receives the service role key (architecture rule 1)", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-must-not-leak";

    staffSupabase();

    expect(JSON.stringify(createClient.mock.calls[0])).not.toContain("service-role-must-not-leak");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
});
