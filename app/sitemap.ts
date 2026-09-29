import type { MetadataRoute } from "next";

/**
 * The public pages a search engine should know about. Spec 0013, AC-22.
 *
 * Only the four pages anyone may open; the staff screens, sign in and the API
 * are left out here and disallowed in `robots.ts`.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const PUBLIC_PATHS = ["/", "/schedule", "/privacy", "/terms"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: new URL(path, SITE_URL).toString() }));
}
