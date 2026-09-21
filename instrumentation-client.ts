import posthog from "posthog-js";

import { posthogConfigured } from "@/lib/env";
import { POSTHOG_INGEST_PREFIX, POSTHOG_UI_HOST } from "@/lib/analytics/hosts";

/**
 * Client side PostHog init. Spec 0009.
 *
 * Read once at page load: under `/staff` or `/sign-in` the browser is
 * identified (a user id follows), everywhere else, starting with the public
 * board, it is cookieless (AC-1). A staff member navigating from `/staff` to
 * `/` by client side routing stays in the mode this page load started in;
 * that is accepted (spec 0009, Decision).
 *
 * Session replay, autocapture, surveys, heatmaps and web vitals are off in
 * both modes (AC-12): the only browser events are `$pageview`, `$pageleave`,
 * `board_day_viewed` and `$exception`. Traffic goes through this app's own
 * `/ingest` rewrite, never PostHog's domain directly (AC-10).
 */
if (posthogConfigured) {
  const isStaffSurface =
    typeof window !== "undefined" &&
    (window.location.pathname === "/sign-in" ||
      window.location.pathname.startsWith("/sign-in/") ||
      window.location.pathname === "/staff" ||
      window.location.pathname.startsWith("/staff/"));

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
    api_host: POSTHOG_INGEST_PREFIX,
    ui_host: POSTHOG_UI_HOST,
    defaults: "2026-05-30",
    ...(isStaffSurface
      ? { persistence: "localStorage" as const, person_profiles: "identified_only" as const }
      : { cookieless_mode: "always" as const }),
    autocapture: false,
    capture_exceptions: true,
    disable_session_recording: true,
    disable_surveys: true,
    capture_performance: false,
    capture_heatmaps: false,
  });
}
