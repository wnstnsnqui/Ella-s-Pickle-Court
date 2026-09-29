import type { MetadataRoute } from "next";

import { PUBLIC_PATHS } from "./sitemap";

/**
 * What crawlers may and may not read. Spec 0013, AC-22: the public pages are
 * open, and the signed in surface, the auth pages, the design gallery and the
 * JSON endpoints are not.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [...PUBLIC_PATHS],
      disallow: ["/staff", "/sign-in", "/sign-up", "/reset", "/design", "/api"],
    },
    sitemap: new URL("/sitemap.xml", SITE_URL).toString(),
  };
}
