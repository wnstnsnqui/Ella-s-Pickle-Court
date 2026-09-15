/**
 * A sliding window rate limit, in memory. Spec 0006, AC-8.
 *
 * One map per process, which is correct for the one container this app runs in
 * (spec 0001) and would need a shared store the day there are two. Each key
 * holds the timestamps of its recent hits; a hit is allowed while fewer than
 * `limit` of them fall inside the window. Sliding rather than fixed, so a
 * client cannot get two windows' worth by straddling a boundary.
 *
 * Memory stays bounded three ways: a key is pruned to the window on every hit,
 * a sweep drops keys with nothing left in the window, and an insert past the
 * cap evicts the oldest inserted key (a Map keeps insertion order).
 */
export type RateLimitOptions = {
  /** Hits allowed inside one window. */
  limit: number;
  windowMs: number;
  /** How often to drop keys with no hit left in the window. */
  sweepEveryMs?: number;
  /** The most keys kept before the oldest inserted one is evicted. */
  maxKeys?: number;
};

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export class SlidingWindow {
  private readonly hits = new Map<string, number[]>();
  private lastSweep: number | null = null;
  private readonly sweepEveryMs: number;
  private readonly maxKeys: number;

  constructor(private readonly options: RateLimitOptions) {
    this.sweepEveryMs = options.sweepEveryMs ?? options.windowMs;
    this.maxKeys = options.maxKeys ?? 10_000;
  }

  /** Record a hit for `key` and say whether it is allowed. */
  hit(key: string, now: number = Date.now()): RateLimitDecision {
    this.sweep(now);

    const since = now - this.options.windowMs;
    const kept = (this.hits.get(key) ?? []).filter((at) => at > since);

    if (kept.length >= this.options.limit) {
      this.hits.set(key, kept);
      const oldest = kept[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest - since) / 1_000));
      return { allowed: false, retryAfterSeconds };
    }

    kept.push(now);
    // Re insert so the key moves to the newest end of the insertion order.
    this.hits.delete(key);
    this.hits.set(key, kept);

    while (this.hits.size > this.maxKeys) {
      const eldest = this.hits.keys().next().value;
      if (eldest === undefined) break;
      this.hits.delete(eldest);
    }

    return { allowed: true };
  }

  /** How many keys are held right now. For tests and for a health readout. */
  get size(): number {
    return this.hits.size;
  }

  private sweep(now: number): void {
    if (this.lastSweep !== null && now - this.lastSweep < this.sweepEveryMs) return;
    this.lastSweep = now;
    const since = now - this.options.windowMs;
    for (const [key, at] of this.hits) {
      if (!at.some((stamp) => stamp > since)) this.hits.delete(key);
    }
  }
}

/**
 * The client address the limit keys on, from the header the host's reverse
 * proxy sets. Neither header present means direct traffic (development, or a
 * host that does not set it), and there is nothing to key on, so the caller
 * skips the limit rather than putting everybody in one bucket.
 */
export function clientAddress(headers: { get(name: string): string | null }): string | null {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  const real = headers.get("x-real-ip")?.trim();
  return real || null;
}
