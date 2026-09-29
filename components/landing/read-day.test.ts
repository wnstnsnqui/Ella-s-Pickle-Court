import { describe, expect, it, vi } from "vitest";

import { LANDING_RETRY_DELAYS_MS, readDay } from "./read-day";

/**
 * Spec 0013, AC-7 and AC-8: one try then five quiet retries after 1, 2, 4, 8
 * and 16 seconds; a 429 stops at once; a newer read cancels an older one.
 */

const ok = { ok: true, data: { grid: { date: "2026-09-29" } } };
const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function harness(responses: (() => Response | Promise<Response>)[]) {
  const waits: number[] = [];
  const fetch = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    return next();
  });
  const sleep = async (ms: number) => {
    waits.push(ms);
  };
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls: fetch, waits, sleep };
}

describe("readDay", () => {
  it("waits 1, 2, 4, 8 and 16 seconds, then gives up after six tries", async () => {
    const h = harness(Array.from({ length: 6 }, () => () => respond(500, { ok: false })));
    expect(await readDay("2026-09-29", h)).toEqual({ ok: false, reason: "failed" });
    expect(h.calls).toHaveBeenCalledTimes(6);
    expect(h.waits).toEqual([...LANDING_RETRY_DELAYS_MS]);
    expect(h.waits).toEqual([1_000, 2_000, 4_000, 8_000, 16_000]);
  });

  it("retries a network error and a body that is not ok, then lands", async () => {
    const h = harness([
      () => Promise.reject(new TypeError("offline")),
      () => respond(200, { ok: false }),
      () => new Response("<html>", { status: 200 }),
      () => respond(200, ok),
    ]);
    const result = await readDay("2026-09-29", h);
    expect(result).toEqual(ok);
    expect(h.waits).toEqual([1_000, 2_000, 4_000]);
  });

  it("stops at once on a 429", async () => {
    const h = harness([() => respond(429, { ok: false })]);
    expect(await readDay(undefined, h)).toEqual({ ok: false, reason: "limited" });
    expect(h.calls).toHaveBeenCalledTimes(1);
    expect(h.waits).toEqual([]);
  });

  it("reads today undated and a day by date", async () => {
    const h = harness([() => respond(200, ok), () => respond(200, ok)]);
    await readDay(undefined, h);
    await readDay("2026-09-29", h);
    expect(h.calls.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
      "/api/schedule",
      "/api/schedule?date=2026-09-29",
    ]);
  });

  it("drops its answer once a newer read takes over", async () => {
    let cancelled = false;
    const h = harness([
      () => {
        cancelled = true;
        return respond(200, ok);
      },
    ]);
    expect(await readDay("2026-09-29", { ...h, cancelled: () => cancelled })).toEqual({
      ok: false,
      reason: "cancelled",
    });
  });
});
