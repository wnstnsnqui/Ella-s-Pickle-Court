import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Architecture rules 1, 2 and 10, and spec 0004 (revised) AC-6: the staff
 * client carries a token minted for the signed in staff member so row level
 * security can decide what they may do, and it is built fresh per request
 * because it belongs to one particular person.
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
const currentSubject = vi.hoisted(() => vi.fn());
const mintStaffToken = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@/lib/auth/session", () => ({ currentSubject }));
vi.mock("./staff-token", () => ({ mintStaffToken }));

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

  it("supplies a token minted for the session's user through the accessToken callback (AC-6)", async () => {
    const subject = { id: "user_1", username: "ella", name: "Ella" };
    currentSubject.mockResolvedValue(subject);
    mintStaffToken.mockResolvedValue("minted-token");

    staffSupabase();

    expect(await accessTokenFromCall()()).toBe("minted-token");
    expect(mintStaffToken).toHaveBeenCalledWith(subject);
  });

  it("hands over no token at all when nobody is signed in", async () => {
    currentSubject.mockResolvedValue(null);

    staffSupabase();

    expect(await accessTokenFromCall()()).toBeNull();
    expect(mintStaffToken).not.toHaveBeenCalled();
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
