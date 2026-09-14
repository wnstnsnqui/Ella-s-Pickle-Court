import { describe, expect, it, vi } from "vitest";

import { withRetry, WriteTimeoutError } from "./retry";

/**
 * Spec 0005, AC-13 and invariant 9: a write that never answers is retried
 * with a backoff of 1, 2 and 4 seconds, at most three times, and an answer of
 * any kind is returned the moment it arrives.
 */

const noSleep = vi.fn<(ms: number) => Promise<void>>(async () => {});

describe("withRetry", () => {
  it("returns a typed result on the first try without sleeping", async () => {
    const attempt = vi.fn(async () => ({ ok: false, error: { kind: "conflict" } }));
    const result = await withRetry(attempt, { sleep: noSleep });
    expect(result).toEqual({ ok: false, error: { kind: "conflict" } });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(noSleep).not.toHaveBeenCalled();
  });

  it("retries a throw with the backoff, then succeeds", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    let calls = 0;
    const attempt = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new TypeError("Failed to fetch");
      return "landed";
    });

    await expect(withRetry(attempt, { sleep })).resolves.toBe("landed");
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1_000, 2_000]);
  });

  it("gives up after the third retry and throws the last error", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const attempt = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(withRetry(attempt, { sleep })).rejects.toThrow("Failed to fetch");
    expect(attempt).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1_000, 2_000, 4_000]);
  });

  it("treats a hang as a failure once the timeout runs out", async () => {
    vi.useFakeTimers();
    try {
      const attempt = vi.fn(() => new Promise<never>(() => {}));
      const pending = withRetry(attempt, { timeoutMs: 50, delaysMs: [], sleep: noSleep });
      const outcome = expect(pending).rejects.toBeInstanceOf(WriteTimeoutError);
      await vi.advanceTimersByTimeAsync(60);
      await outcome;
    } finally {
      vi.useRealTimers();
    }
  });
});
