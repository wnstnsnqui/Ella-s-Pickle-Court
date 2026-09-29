/**
 * Asking again, quietly, before telling anybody. Spec 0014, AC-3, AC-5 and AC-12.
 *
 * One try, then one more after each delay in turn, for as long as the result
 * says it is worth another go (`retry: true`). A result that says otherwise
 * (a success, a `429`, a refusal) is handed back at once. Nothing here touches
 * the screen: the caller decides what a spent run of retries looks like.
 *
 * `cancelled()` is checked before every try and after every answer, so a
 * newer read that took over stops an older one's retries on the spot and its
 * answer is never handed back.
 *
 * The landing page and the boards share this with different delay lists: the
 * landing page can wait half a minute behind its message card, a board held
 * dimmed cannot.
 */

/** The boards: 1, 2 and 4 seconds, then the day snaps back (spec 0014, AC-5). */
export const BOARD_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

export type QuietRetryOptions = {
  delaysMs: readonly number[];
  /** Swappable so a test does not have to wait real seconds. */
  sleep?: (ms: number) => Promise<void>;
  /** A newer read took over: stop trying and hand nothing back. */
  cancelled?: () => boolean;
};

export type QuietRetryOutcome<R> = { cancelled: true } | { cancelled: false; result: R };

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Whether a result asks for another go. A success carries no `retry` at all. */
function wantsRetry(result: object): boolean {
  return "retry" in result && result.retry === true;
}

export async function withQuietRetries<R extends object>(
  attempt: () => Promise<R>,
  { delaysMs, sleep = realSleep, cancelled = () => false }: QuietRetryOptions,
): Promise<QuietRetryOutcome<R>> {
  for (let tries = 0; ; tries += 1) {
    if (cancelled()) return { cancelled: true };
    const result = await attempt();
    if (cancelled()) return { cancelled: true };
    if (!wantsRetry(result) || tries >= delaysMs.length) return { cancelled: false, result };
    await sleep(delaysMs[tries]);
  }
}
