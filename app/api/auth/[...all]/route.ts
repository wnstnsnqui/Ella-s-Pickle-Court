import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

/**
 * Better Auth's own endpoints, under `/api/auth/*`. Spec 0004 (revised).
 *
 * Sign in, sign out, the session read and the password change all live
 * here. Account creation passes through the
 * `user.create.before` hook in `lib/auth.ts`, so a raw request to
 * `/api/auth/sign-up/email` with no claimed invite is refused the same as any
 * other path (AC-1). Better Auth rate limits these itself (AC-14);
 * `proxy.ts` never touches them.
 */
export const dynamic = "force-dynamic";

export const { GET, POST } = toNextJsHandler(auth);
