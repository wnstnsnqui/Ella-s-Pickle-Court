import "server-only";

import { PostHog } from "posthog-node";

import { posthogConfigured } from "@/lib/env";

import { POSTHOG_API_HOST } from "./hosts";
import {
  parseEventProperties,
  scrubError,
  type AnalyticsEvent,
  type EventProperties,
} from "./properties";

/**
 * The server side half of spec 0009: one event after a successful Server
 * Action write, one exception when a write or a query fails unexpectedly.
 *
 * Analytics never changes an outcome (invariant 1): every function here is
 * fire and forget, never awaited by its caller, and swallows its own
 * rejection. With no PostHog key, everything below is a no-op (AC-9).
 */

let client: PostHog | null = null;
let loggedOn = false;

/** The one `posthog-node` client for this process, created on first use. */
export function analyticsServer(): PostHog | null {
  if (!posthogConfigured) return null;
  if (!client) {
    // Short lived server functions can exit before a batched queue flushes,
    // so nothing is ever held in memory: every capture goes out immediately.
    client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
      host: POSTHOG_API_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
    if (!loggedOn) {
      loggedOn = true;
      console.info("analytics: PostHog is on.");
    }
  }
  return client;
}

/** At most one warning a minute per process, so a vendor outage never floods the log. */
let lastWarnAt = 0;
const WARN_INTERVAL_MS = 60_000;

function warnOnce(message: string): void {
  const now = Date.now();
  if (now - lastWarnAt < WARN_INTERVAL_MS) return;
  lastWarnAt = now;
  console.warn(message);
}

/**
 * Send one event for a staff member's action, after the write that made it
 * true has already succeeded. Never awaited by the caller (invariant 1); a
 * property bag that fails its allow list is dropped whole (AC-5), never sent
 * partially.
 */
export function captureStaffEvent<E extends AnalyticsEvent>(
  distinctId: string,
  event: E,
  properties: EventProperties<E>,
): void {
  const posthog = analyticsServer();
  if (!posthog) return;

  const parsed = parseEventProperties(event, properties);
  if (!parsed.ok) {
    warnOnce(
      `analytics: dropped "${event}", properties failed its allow list: ${parsed.issues.join(", ")}`,
    );
    return;
  }

  try {
    posthog.capture({ distinctId, event, properties: parsed.data });
  } catch {
    warnOnce(`analytics: capture of "${event}" failed.`);
  }
}

/**
 * Record an unexpected server side failure as a PostHog exception. Spec 0009,
 * AC-7: a Server Action or query answering `kind: "failed"` is captured here;
 * every other `ActionError` kind is an expected outcome and is never passed
 * to this function.
 */
export function reportFailure(
  error: { code?: string; message: string; details?: unknown; hint?: unknown },
  context: { action: string; distinctId?: string },
): void {
  const posthog = analyticsServer();
  if (!posthog) return;

  const scrubbed = scrubError(error);
  const failure = new Error(`${context.action}: ${scrubbed.code ?? "unknown"} ${scrubbed.message}`);
  failure.name = "ActionFailed";

  try {
    posthog.captureException(failure, context.distinctId, {
      action: context.action,
      code: scrubbed.code,
    });
  } catch {
    warnOnce(`analytics: reportFailure for "${context.action}" failed.`);
  }
}

/**
 * The unverified `sub` claim of Clerk's `__session` cookie, for attribution
 * only. `onRequestError` in `instrumentation.ts` runs outside any request
 * store, so Clerk's `auth()` cannot be called there; a forged value here only
 * misattributes an exception, it grants nothing, so signature verification
 * would cost a request for no security benefit. Spec 0009, AC-6.
 */
export function clerkSubjectFromCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)__session=([^;]+)/);
  if (!match) return undefined;
  try {
    const token = decodeURIComponent(match[1]);
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const claims = JSON.parse(json) as { sub?: string };
    return typeof claims.sub === "string" ? claims.sub : undefined;
  } catch {
    return undefined;
  }
}
