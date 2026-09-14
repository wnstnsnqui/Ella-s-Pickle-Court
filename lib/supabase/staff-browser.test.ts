import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0005, invariant 6: the staff board listens through its own browser
 * client, separate from the anonymous one, memoised per tab, and it is never
 * handed a token at construction (the token is applied with
 * `realtime.setAuth()` by the hook, per Clerk refresh).
 */

type ClientOptions = {
  accessToken?: () => Promise<string | null>;
  auth?: { persistSession?: boolean; autoRefreshToken?: boolean };
};

const createClient = vi.hoisted(() =>
  vi.fn<(url: string, key: string, options?: ClientOptions) => { marker: string }>(() => ({
    marker: "staff client",
  })),
);
vi.mock("@supabase/supabase-js", () => ({ createClient }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_test";
});

describe("staffBrowserSupabase", () => {
  it("builds one client per tab from the project URL and anon key", async () => {
    const { staffBrowserSupabase } = await import("./staff-browser");

    const first = staffBrowserSupabase();
    const second = staffBrowserSupabase();

    expect(first).toBe(second);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_test",
      expect.objectContaining({ auth: { persistSession: false, autoRefreshToken: false } }),
    );
  });

  it("is a different instance from the anonymous browser client, never merged", async () => {
    const { staffBrowserSupabase } = await import("./staff-browser");
    const { browserSupabase } = await import("./browser");

    staffBrowserSupabase();
    browserSupabase();

    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("takes no token at construction; the hook applies it with realtime.setAuth()", async () => {
    const { staffBrowserSupabase } = await import("./staff-browser");

    staffBrowserSupabase();

    expect(createClient.mock.calls[0]?.[2] ?? {}).not.toHaveProperty("accessToken");
  });
});
