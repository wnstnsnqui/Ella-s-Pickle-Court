/**
 * PostHog's US cloud hosts and the local rewrite prefix that fronts them. Spec
 * 0009, AC-10.
 *
 * Constants, not environment variables: the project API key is the only thing
 * that varies by environment, because the region is a decision made once, not
 * a deploy time setting. `next.config.ts` rewrites `POSTHOG_INGEST_PREFIX` to
 * `POSTHOG_API_HOST`/`POSTHOG_ASSETS_HOST` so the browser only ever talks to
 * this app's own domain.
 */

export const POSTHOG_INGEST_PREFIX = "/ingest";
export const POSTHOG_API_HOST = "https://us.i.posthog.com";
export const POSTHOG_ASSETS_HOST = "https://us-assets.i.posthog.com";
export const POSTHOG_UI_HOST = "https://us.posthog.com";
