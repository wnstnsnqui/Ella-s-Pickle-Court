"use client";

import posthog from "posthog-js";

import { posthogConfigured } from "@/lib/env";
import type { StaffRole } from "@/lib/staff";

import { parseEventProperties } from "./properties";

/**
 * Thin wrappers over `posthog-js` for the browser half of spec 0009. Each
 * no-ops when analytics is unconfigured, since `posthog.init` is never called
 * by `instrumentation-client.ts` in that case and every method below becomes
 * a no-op on the uninitialised singleton.
 */

/** One `identify()` per staff page load. Spec 0009, AC-3. */
export function identifyStaff(staff: { id: string; displayName: string; role: StaffRole }): void {
  if (!posthogConfigured) return;
  posthog.identify(staff.id, { display_name: staff.displayName, role: staff.role });
}

/** Clears the browser's identity before Clerk signs the person out (AC-3). */
export function resetIdentity(): void {
  if (!posthogConfigured) return;
  posthog.reset();
}

/**
 * One `board_day_viewed` per shown day. Spec 0009, AC-2. Property bag still
 * goes through the same allow list as the server events, so a bad call site
 * fails loudly in development rather than silently widening the schema.
 */
export function captureDayViewed(dayOffset: number): void {
  if (!posthogConfigured) return;
  const parsed = parseEventProperties("board_day_viewed", { day_offset: dayOffset });
  if (!parsed.ok) {
    console.warn(
      `analytics: dropped "board_day_viewed", failed its allow list: ${parsed.issues.join(", ")}`,
    );
    return;
  }
  posthog.capture("board_day_viewed", parsed.data);
}
