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
  // Phosphor exports well over a thousand icons from one barrel and, unlike
  // lucide-react, is not on Next's built in list, so load only the ones imported.
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  // Spec 0013, AC-21: the board moved to `/schedule`, so an old shared
  // `/?date=` link lands on that day's board. Next passes the query through
  // unchanged, and the board validates the date as it always has.
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "query", key: "date" }],
        destination: "/schedule",
        permanent: true,
      },
    ];
  },
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
