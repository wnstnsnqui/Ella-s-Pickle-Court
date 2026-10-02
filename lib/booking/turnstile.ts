import "server-only";

import { bookingEnv } from "@/lib/env";

import { HOLD_TURNSTILE_ACTION } from "./constants";

/**
 * The checkout's bot check. Spec 0015, AC-19.
 *
 * Every hold call carries a fresh Turnstile token, and the server redeems it at
 * Siteverify before it mints anything. A token is single use, so a replay fails
 * here. Fails closed: a network error, a timeout (10 seconds), a non 2xx or a
 * body that is not JSON all count as a failed check.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type SiteverifyAnswer = {
  success?: unknown;
  action?: unknown;
  hostname?: unknown;
  metadata?: { result_with_testing_key?: unknown };
};

/**
 * Whether a Siteverify answer lets the hold go on: `success`, the expected
 * action, and a hostname on the allow list.
 *
 * Cloudflare's testing secret answers with no action at all, so outside
 * production a testing key result skips the action check (the hostname check
 * still applies: the test keys report `example.com`). In production a testing
 * key result is refused outright, because that secret accepts any token.
 */
export function siteverifyPasses(
  answer: SiteverifyAnswer,
  expected: { action: string; hostnames: readonly string[]; production: boolean },
): boolean {
  if (answer.success !== true) return false;
  if (typeof answer.hostname !== "string" || !expected.hostnames.includes(answer.hostname)) {
    return false;
  }
  const testing = answer.metadata?.result_with_testing_key === true;
  if (testing) return !expected.production;
  return answer.action === expected.action;
}

/** Redeem a token for the hold. True only when Siteverify says yes to all of it. */
export async function verifyTurnstile(token: string, remoteIp: string | null): Promise<boolean> {
  const env = bookingEnv();
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  let answer: SiteverifyAnswer;
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`siteverify answered ${response.status}`);
    answer = (await response.json()) as SiteverifyAnswer;
  } catch {
    console.warn("verifyTurnstile: Siteverify did not answer; failing closed");
    return false;
  }

  return siteverifyPasses(answer, {
    action: HOLD_TURNSTILE_ACTION,
    hostnames: env.TURNSTILE_HOSTNAMES,
    production: process.env.VERCEL_ENV === "production",
  });
}
