import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The browser client listens for court broadcasts. Anon key, no Clerk token, and
 * one instance per tab: a second client would open a second websocket for nothing.
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_test";
});

describe("browserSupabase", () => {
  it("builds a client from the project URL and the anon key", async () => {
    const { browserSupabase } = await import("./browser");

    browserSupabase();

    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_test",
      expect.anything(),
    );
  });

  it("reuses one client per tab rather than opening a second websocket", async () => {
    const { browserSupabase } = await import("./browser");

    const first = browserSupabase();
    const second = browserSupabase();

    expect(first).toBe(second);
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("carries no Clerk token, so it is read only like the public client", async () => {
    const { browserSupabase } = await import("./browser");

    browserSupabase();

    expect(createClient.mock.calls[0]?.[2] ?? {}).not.toHaveProperty("accessToken");
  });
});
