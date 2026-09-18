import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0009, AC-9 and the dev-noise gate: `posthogConfigured` needs a project
 * key AND either a non-development runtime or an explicit dev opt-in, so a
 * `next dev` session never reports its transient errors into the production
 * project. `posthogConfigured` is read once at import, so each case re-imports
 * after stubbing the environment.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function readFlag(): Promise<boolean> {
  const { posthogConfigured } = await import("./env");
  return posthogConfigured;
}

describe("posthogConfigured", () => {
  it("is off with no key, whatever the runtime", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(await readFlag()).toBe(false);
  });

  it("is on in a production build with a key", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NODE_ENV", "production");
    expect(await readFlag()).toBe(true);
  });

  it("stays off in development with a key but no opt-in", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV", "");
    expect(await readFlag()).toBe(false);
  });

  it("turns on in development only when the opt-in is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV", "true");
    expect(await readFlag()).toBe(true);
  });
});
