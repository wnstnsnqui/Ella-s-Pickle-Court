import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins/username";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from "@/lib/auth/constants";
import { allowUserCreation } from "@/lib/auth/gate";
import { authPool } from "@/lib/auth/pool";
import { authConfigured, serverEnv } from "@/lib/env";

/**
 * Better Auth, configured. Spec 0004 (revised).
 *
 * Identity and sessions live in the `better_auth` schema of the project's own
 * Postgres, reached through `authPool()` as the `better_auth_app` role. Staff
 * sign in with a username and a password through the `username` plugin; the
 * email Better Auth insists on is a placeholder nobody reads (see
 * `placeholderEmail()`). The one rule of this file is the `user.create.before`
 * hook, `allowUserCreation` in `lib/auth/gate.ts`: no account exists without
 * a claimed invite, except the single bootstrap account (invariant 1). Every
 * creation path, our own form and a raw request to `/api/auth/sign-up/email`,
 * passes through it.
 *
 * In development with no `BETTER_AUTH_SECRET` the module still loads so the
 * public board boots (Better Auth falls back to an in memory store and warns);
 * in production it refuses (AC-11).
 */

// A production server refuses to serve without the secret (AC-11). `next build`
// also runs with NODE_ENV=production while it collects page data, and a build
// on a machine with no credentials must still succeed (spec 0001), so the
// build phase is the one exception.
if (
  !authConfigured &&
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  throw new Error("BETTER_AUTH_SECRET is missing. Refusing to run without it.");
}

const env = authConfigured ? serverEnv() : null;
const production = process.env.NODE_ENV === "production";

const DAY_SECONDS = 60 * 60 * 24;

export const auth = betterAuth({
  baseURL: env?.BETTER_AUTH_URL,
  secret: env?.BETTER_AUTH_SECRET,
  trustedOrigins: env ? [env.BETTER_AUTH_URL] : undefined,
  database: env ? authPool() : undefined,

  // Still the credential provider underneath the username plugin: it is what
  // hashes and verifies the password and creates the account row.
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    revokeSessionsOnPasswordReset: true,
  },

  // 30 days, refreshed daily while used, with a five minute cookie cache so a
  // page load does not always cost a session row read (AC-4, AC-8).
  session: {
    expiresIn: 30 * DAY_SECONDS,
    updateAge: DAY_SECONDS,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  // Counters in the database so they survive a serverless instance being
  // replaced (AC-14). The default rule for the sensitive endpoints (3 requests
  // per 10 seconds on sign in, sign up and change password) is kept.
  rateLimit: { enabled: true, storage: "database" },

  advanced: {
    useSecureCookies: production,
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          await allowUserCreation(user, ctx?.headers?.get("cookie"));
        },
      },
    },
  },

  plugins: [
    // The sign in name. Validated after lower casing, with the same rule
    // `usernameSchema` applies in the forms, and fixed once chosen: the
    // `staff` row, the invite claim and the placeholder email all key on it.
    username({
      minUsernameLength: USERNAME_MIN_LENGTH,
      maxUsernameLength: USERNAME_MAX_LENGTH,
      usernameValidator: (value) => USERNAME_PATTERN.test(value),
      validationOrder: { username: "post-normalization" },
      immutableUsername: true,
      displayUsername: false,
    }),
    // Last, so a Server Action's `auth.api.*` call sets its cookies on the
    // response through Next's cookie store.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
