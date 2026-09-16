import type { NextConfig } from "next";

import {
  POSTHOG_API_HOST,
  POSTHOG_ASSETS_HOST,
  POSTHOG_INGEST_PREFIX,
} from "@/lib/analytics/hosts";

const nextConfig: NextConfig = {
  // Spec 0001: self hosted Docker container, so the build emits a standalone
  // server there. Vercel bundles the app its own way and trips over the
  // standalone output shape, so this stays off for Vercel's own builds
  // (it sets VERCEL=1) while the eventual move to Docker/Railway keeps it on.
  output: process.env.VERCEL ? undefined : "standalone",
  // Spec 0009, AC-10: the browser only ever talks to this app's own domain.
  // PostHog's SDK is initialised with `api_host: "/ingest"`, and these three
  // rewrites forward that traffic on to PostHog's US cloud hosts.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: `${POSTHOG_INGEST_PREFIX}/static/:path*`,
        destination: `${POSTHOG_ASSETS_HOST}/static/:path*`,
      },
      {
        source: `${POSTHOG_INGEST_PREFIX}/array/:path*`,
        destination: `${POSTHOG_ASSETS_HOST}/array/:path*`,
      },
      {
        source: `${POSTHOG_INGEST_PREFIX}/:path*`,
        destination: `${POSTHOG_API_HOST}/:path*`,
      },
    ];
  },
};

export default nextConfig;
