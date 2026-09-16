import { z } from "zod";

/**
 * Environment access for spec 0001.
 *
 * Validation is lazy on purpose: `next build` must succeed on a machine with no
 * credentials, and a missing key should fail loudly at the moment something
 * actually needs it rather than silently at import time.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` is deliberately absent from this file. Architecture
 * rule 1: the service role key belongs to migrations and admin tooling only and
 * must never be reachable from application code.
 */

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    error: "NEXT_PUBLIC_SUPABASE_URL must be your Supabase project URL.",
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing."),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Read the Supabase values the browser and public reads need.
 *
 * These are referenced as literal `process.env.X` so the Next.js build can inline
 * them into client bundles. A destructured or computed lookup would not be inlined.
 */
export function publicEnv(): PublicEnv {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/** The one timezone every court time is displayed in. Spec 0001. */
export const VENUE_TIMEZONE = process.env.NEXT_PUBLIC_VENUE_TIMEZONE || "Asia/Manila";

/**
 * Whether Clerk keys are present.
 *
 * With no keys the app still boots and the public path still works, so you can
 * look at the scaffold before signing up to anything. Anything needing a signed in
 * staff member is hidden or refused instead of crashing the page. `proxy.ts`
 * refuses to run at all in production without the key, so this can only ever be
 * false in development.
 */
export const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/**
 * Whether a PostHog project key is present. Spec 0009, AC-9.
 *
 * With this false, `instrumentation-client.ts` never calls `posthog.init`,
 * `captureStaffEvent()` and `reportFailure()` in `lib/analytics/server.ts`
 * return without contacting anything, and `onRequestError` in
 * `instrumentation.ts` is a no-op. Development stays silent by leaving the key
 * empty; there is no separate `NODE_ENV` gate.
 */
export const posthogConfigured = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
