import { afterEach, describe, expect, it, vi } from "vitest";

import { publicTransport } from "./use-public-schedule";

/**
 * Spec 0006, AC-5 and AC-9: the public transport reads the day from the
 * endpoint, undated when the page is undated, and turns a 429 into a wait
 * from its Retry-After (five seconds when the header is missing).
 */

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("publicTransport", () => {
  it("reads today when undated and the day when dated (AC-5, AC-10)", async () => {
    const fetch = vi.fn().mockResolvedValue(respond(200, { ok: true, data: { grid: {} } }));
    vi.stubGlobal("fetch", fetch);

    expect(await publicTransport()).toEqual({ ok: true, data: { grid: {} } });
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/schedule");

    await publicTransport("2026-09-20");
    expect(fetch.mock.calls[1]?.[0]).toBe("/api/schedule?date=2026-09-20");
  });

  it("turns a 429 into a wait from Retry-After (AC-9)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(429, {}, { "Retry-After": "7" })));
    const result = await publicTransport();
    expect(result).toMatchObject({ ok: false, retryAfterMs: 7_000 });
  });

  it("waits five seconds after a 429 with no header (AC-9)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(429, {})));
    expect(await publicTransport()).toMatchObject({ ok: false, retryAfterMs: 5_000 });
  });

  it("passes the endpoint's error message through with no wait", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          respond(422, { ok: false, error: { kind: "invalid", message: "Past." } }),
        ),
    );
    const result = await publicTransport("2026-01-01");
    expect(result).toEqual({ ok: false, message: "Past." });
  });

  it("copes with a body that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 502 })));
    const result = await publicTransport();
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("502") });
  });
});
