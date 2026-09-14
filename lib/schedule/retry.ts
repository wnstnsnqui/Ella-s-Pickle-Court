/**
 * Retrying a write that never answered. Spec 0005, AC-13 and invariant 9.
 *
 * A Server Action either returns a typed result or it does not return at all:
 * a dropped connection throws, a stalled one hangs. Only the second kind is
 * retried, and only because every write behind it is guarded (the exclusion
 * constraint, or `version`), so a retry after a silent success cannot act
 * twice. A typed `conflict` or `forbidden` is an answer and is never retried.
 */

export const WRITE_TIMEOUT_MS = 10_000;

/** 1, 2 and 4 seconds: three retries after the first try. */
export const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

export class WriteTimeoutError extends Error {
  constructor() {
    super("The write did not answer in time.");
    this.name = "WriteTimeoutError";
  }
}

export type RetryOptions = {
  timeoutMs?: number;
  delaysMs?: readonly number[];
  /** Swappable so a test does not have to wait real seconds. */
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `attempt` until it returns, retrying on a throw or a timeout with the
 * given delays between tries. After the last delay is spent the final error is
 * thrown to the caller, which is the point where the cells read Change refused.
 */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  {
    timeoutMs = WRITE_TIMEOUT_MS,
    delaysMs = RETRY_DELAYS_MS,
    sleep = realSleep,
  }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown;
  for (let index = 0; index <= delaysMs.length; index += 1) {
    try {
      return await withTimeout(attempt(), timeoutMs);
    } catch (error) {
      lastError = error;
      if (index === delaysMs.length) break;
      await sleep(delaysMs[index]);
    }
  }
  throw lastError;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new WriteTimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
