import { withQuietRetries } from "@/lib/schedule/quiet-retry";
import type { Schedule } from "@/lib/schedule/queries";

/**
 * The landing page's read of a day, retried quietly. Spec 0013, AC-7 and AC-8.
 *
 * One try, then up to five more after 1, 2, 4, 8 and 16 seconds, with nothing
 * on screen saying so. A network error, a non 2xx other than `429`, or a body
 * that is not an `ok` result is a failure worth retrying; a `429` is the
 * shared rate limit answering and stops at once, because asking again sooner
 * only spends more of the same budget.
 *
 * The retrying itself is `withQuietRetries`, shared with the boards (spec
 * 0014, AC-12); only the delay list is the landing page's own.
 *
 * Plain module, no React, with `fetch` and `sleep` swappable, so the schedule
 * of waits is testable with no timers and no network.
 */

export const LANDING_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;

export type DayRead =
  | { ok: true; data: Schedule }
  /** `limited` is a `429`; otherwise every try failed. `cancelled` means a newer read took over. */
  | { ok: false; reason: "limited" | "failed" | "cancelled" };

export type ReadOptions = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** A newer read took over: stop trying and report nothing. */
  cancelled?: () => boolean;
  delaysMs?: readonly number[];
};

type TryResult = { ok: true; data: Schedule } | { ok: false; limited: boolean; retry: boolean };

async function tryOnce(url: string, fetcher: typeof fetch): Promise<TryResult> {
  try {
    const response = await fetcher(url, { cache: "no-store" });
    if (response.status === 429) return { ok: false, limited: true, retry: false };
    if (!response.ok) return { ok: false, limited: false, retry: true };
    const body = (await response.json()) as { ok?: boolean; data?: Schedule };
    return body?.ok === true && body.data
      ? { ok: true, data: body.data }
      : { ok: false, limited: false, retry: true };
  } catch {
    return { ok: false, limited: false, retry: true };
  }
}

/** Read `date` (today when undefined) from `GET /api/schedule`, retrying quietly. */
export async function readDay(
  date: string | undefined,
  options: ReadOptions = {},
): Promise<DayRead> {
  const { fetch: fetcher = fetch, sleep, cancelled, delaysMs = LANDING_RETRY_DELAYS_MS } = options;
  const url = date ? `/api/schedule?date=${encodeURIComponent(date)}` : "/api/schedule";

  const outcome = await withQuietRetries(() => tryOnce(url, fetcher), {
    delaysMs,
    sleep,
    cancelled,
  });
  if (outcome.cancelled) return { ok: false, reason: "cancelled" };
  const { result } = outcome;
  if (result.ok) return result;
  return { ok: false, reason: result.limited ? "limited" : "failed" };
}
