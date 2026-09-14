import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 renamed Middleware to Proxy. Same job, different filename.
 *
 * This is public first on purpose: the public board must stay open to anyone with
 * no sign in, so only the staff board is protected here (spec 0005, AC-1). Real
 * protection lives in two places spec 0001 names, not in this file: every Server
 * Action calls `requireStaff()` first, and row level security in Postgres is the
 * enforcement point. Proxy makes the Clerk session readable by `auth()` further
 * down the request, and sends a signed out visitor to `/sign-in` before any
 * response with customer data is built, with `/staff` carried as the return path.
 */

const hasClerkKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

if (!hasClerkKey && process.env.NODE_ENV === "production") {
  // Never let a production build serve traffic with authentication switched off.
  throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing. Refusing to run without Clerk.");
}

/**
 * The one signed in surface. The sign in pages and the public board stay open.
 * A plain path test rather than Clerk's `createRouteMatcher`, which Clerk 7
 * has deprecated; the page itself still checks `currentStaff()`, so this is
 * the early door, not the lock.
 */
function isStaffRoute(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  return pathname === "/staff" || pathname.startsWith("/staff/");
}

const withClerk = clerkMiddleware(async (auth, request) => {
  if (isStaffRoute(request)) await auth.protect();
});

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
