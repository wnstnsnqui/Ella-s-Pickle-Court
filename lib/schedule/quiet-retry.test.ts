import { describe, expect, it, vi } from "vitest";

import { BOARD_RETRY_DELAYS_MS, withQuietRetries } from "./quiet-retry";

/**
 * Spec 0014, AC-3, AC-5 and AC-12: a retryable failure is tried again after
 * each delay, anything else comes back at once, and a newer read stops an
 * older one's retries and swallows its answer.
 */

type Result = { ok: boolean; retry?: boolean };

function harness(results: Result[]) {
  const waits: number[] = [];
  const attempt = vi.fn(async () => {
    const next = results.shift();
    if (!next) throw new Error("no more results");
    return next;
  });
  const sleep = async (ms: number) => {
    waits.push(ms);
  };
  return { attempt, waits, sleep };
}

const failed: Result = { ok: false, retry: true };

describe("withQuietRetries", () => {
  it("waits 1, 2 and 4 seconds on a board, then hands back the last failure", async () => {
    const h = harness([failed, failed, failed, failed]);
    const outcome = await withQuietRetries(h.attempt, {
      delaysMs: BOARD_RETRY_DELAYS_MS,
      sleep: h.sleep,
    });
    expect(outcome).toEqual({ cancelled: false, result: failed });
    expect(h.attempt).toHaveBeenCalledTimes(4);
    expect(h.waits).toEqual([1_000, 2_000, 4_000]);
  });

  it("lands on the try that succeeds, with nothing more asked", async () => {
    const h = harness([failed, failed, { ok: true }]);
    const outcome = await withQuietRetries(h.attempt, {
      delaysMs: BOARD_RETRY_DELAYS_MS,
      sleep: h.sleep,
    });
    expect(outcome).toEqual({ cancelled: false, result: { ok: true } });
    expect(h.waits).toEqual([1_000, 2_000]);
  });

  it("never retries a failure that says not to (AC-6)", async () => {
    const refused: Result = { ok: false, retry: false };
    const h = harness([refused]);
    const outcome = await withQuietRetries(h.attempt, {
      delaysMs: BOARD_RETRY_DELAYS_MS,
      sleep: h.sleep,
    });
    expect(outcome).toEqual({ cancelled: false, result: refused });
    expect(h.attempt).toHaveBeenCalledTimes(1);
    expect(h.waits).toEqual([]);
  });

  it("stops retrying the moment a newer read takes over (AC-3)", async () => {
    let cancelled = false;
    const h = harness([failed, failed, failed, failed]);
    const sleep = async (ms: number) => {
      h.waits.push(ms);
      cancelled = true;
    };
    const outcome = await withQuietRetries(h.attempt, {
      delaysMs: BOARD_RETRY_DELAYS_MS,
      sleep,
      cancelled: () => cancelled,
    });
    expect(outcome).toEqual({ cancelled: true });
    expect(h.attempt).toHaveBeenCalledTimes(1);
  });

  it("drops an answer that arrives after a newer read took over", async () => {
    let cancelled = false;
    const attempt = async (): Promise<Result> => {
      cancelled = true;
      return { ok: true };
    };
    expect(await withQuietRetries(attempt, { delaysMs: [], cancelled: () => cancelled })).toEqual({
      cancelled: true,
    });
  });
});
