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
 * The server side values spec 0004 (revised) needs for Better Auth and the
 * Supabase bridge. Validated lazily like `publicEnv()`: `next build` on a
 * machine with no secrets still succeeds, and a missing value fails at the
 * moment something needs it, with its own name in the message.
 *
 * `SUPABASE_JWT_SECRET` is deliberately not here. Invariant 6 in spec 0004:
 * only `lib/supabase/staff-token.ts` reads it, and a test pins that.
 */
const serverEnvSchema = z.object({
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters (openssl rand -base64 32)."),
  BETTER_AUTH_URL: z.url({ error: "BETTER_AUTH_URL must be the site origin." }),
  BETTER_AUTH_DATABASE_URL: z
    .string()
    .min(1, "BETTER_AUTH_DATABASE_URL is missing (the better_auth_app pooler URL)."),
  BOOTSTRAP_OWNER_USERNAME: z
    .string()
    .min(
      1,
      "BOOTSTRAP_OWNER_USERNAME must be the one username allowed to create the first account.",
    ),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function serverEnv(): ServerEnv {
  return serverEnvSchema.parse({
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_DATABASE_URL: process.env.BETTER_AUTH_DATABASE_URL,
    BOOTSTRAP_OWNER_USERNAME: process.env.BOOTSTRAP_OWNER_USERNAME,
  });
}

/**
 * Whether Better Auth is set up.
 *
 * With no secret the app still boots and the public board still works, so you
 * can look at the scaffold before filling `.env.local`. Anything needing a
 * signed in staff member is hidden or refused instead of crashing the page.
 * `lib/auth.ts` refuses to load at all in production without the secret
 * (spec 0004, AC-11), so this can only ever be false in development.
 */
export const authConfigured = Boolean(process.env.BETTER_AUTH_SECRET);

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
