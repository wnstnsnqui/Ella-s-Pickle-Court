import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 renamed Middleware to Proxy. Same job, different filename.
 *
 * This is public first on purpose: the public board must stay open to anyone with
 * no sign in, so nothing is protected here. Real protection lives in two places
 * spec 0001 names, not in this file: every Server Action calls `requireStaff()`
 * first, and row level security in Postgres is the enforcement point. Proxy only
 * makes the Clerk session readable by `auth()` further down the request.
 */

const hasClerkKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

if (!hasClerkKey && process.env.NODE_ENV === "production") {
  // Never let a production build serve traffic with authentication switched off.
  throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing. Refusing to run without Clerk.");
}

const withClerk = clerkMiddleware();

/**
 * In development with no keys yet, pass the request through untouched so the
 * scaffold still boots and the public path can be looked at. Anything needing a
 * signed in staff member fails clearly at `requireStaff()`. The check above means
 * this shortcut can never happen in production.
 */
export default function proxy(request: NextRequest, event: Parameters<typeof withClerk>[1]) {
  if (!hasClerkKey) return NextResponse.next();
  return withClerk(request, event);
}

export const config = {
  matcher: [
    // Everything except Next.js internals and static files, unless a file name
    // shows up in a search parameter.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run on API and Server Action routes.
    "/(api|trpc)(.*)",
  ],
};
