import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { clientAddress, SlidingWindow } from "@/lib/rate-limit";

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
 *
 * It is also where the public reads are rate limited (spec 0006, AC-8), before
 * Clerk and before any database work. Proxy runs on the Node.js runtime in
 * Next.js 16 (`node_modules/next/dist/docs`, "Runtime"), so the module level
 * window below is one instance per container process.
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
 *
 * The CSV route (spec 0008, AC-9) is carved out: `auth.protect()` answers an
 * unauthenticated request with a redirect or Clerk's own 404, never the typed
 * 401/403 the route's own contract promises. It still needs to sit inside the
 * matcher below so Clerk middleware runs and `auth()` has context to read;
 * it just answers its own door rather than this one.
 */
function isStaffRoute(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  if (pathname === "/staff/reports/usage.csv") return false;
  return pathname === "/staff" || pathname.startsWith("/staff/");
}

const withClerk = clerkMiddleware(async (auth, request) => {
  if (isStaffRoute(request)) await auth.protect();
});

/**
 * The two public reads, capped per client address (spec 0006, AC-8). Sixty a
 * minute is far above what a real player on a live board makes and far below
 * a scraper in a loop. A request with no forwarded address (direct traffic,
 * only in development or on a host that sets no header) is not limited,
 * because a shared bucket would lock every real player out at once.
 */
export const PUBLIC_READ_LIMIT = 60;
export const PUBLIC_READ_WINDOW_MS = 60_000;

const publicReads = new SlidingWindow({
  limit: PUBLIC_READ_LIMIT,
  windowMs: PUBLIC_READ_WINDOW_MS,
});

function isPublicRead(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  return request.method === "GET" && (pathname === "/" || pathname === "/api/schedule");
}

function tooManyRequests(request: NextRequest, retryAfterSeconds: number): NextResponse {
  const headers = { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" };
  if (request.nextUrl.pathname === "/api/schedule") {
    return NextResponse.json(
      {
        ok: false,
        error: { kind: "rate_limited", message: "Too many requests. Try again shortly." },
      },
      { status: 429, headers },
    );
  }
  return new NextResponse(`Too many requests. Try again in ${retryAfterSeconds} seconds.`, {
    status: 429,
    headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * In development with no keys yet, pass the request through untouched so the
 * scaffold still boots and the public path can be looked at. Anything needing a
 * signed in staff member fails clearly at `requireStaff()`. The check above means
 * this shortcut can never happen in production.
 */
/**
 * PostHog's ingest rewrite (spec 0009, AC-10): traffic to `/ingest/*` is
 * forwarded straight to PostHog by `next.config.ts` and must never be seen by
 * Clerk or the public read limiter, so it is excluded here and in
 * `config.matcher` below.
 */
function isIngest(request: NextRequest): boolean {
  return request.nextUrl.pathname.startsWith("/ingest/");
}

export default function proxy(request: NextRequest, event: Parameters<typeof withClerk>[1]) {
  if (isIngest(request)) return NextResponse.next();
  if (isPublicRead(request)) {
    const address = clientAddress(request.headers);
    if (address !== null) {
      const decision = publicReads.hit(address);
      if (!decision.allowed) return tooManyRequests(request, decision.retryAfterSeconds);
    }
  }
  if (!hasClerkKey) return NextResponse.next();
  return withClerk(request, event);
}

export const config = {
  matcher: [
    // Everything except Next.js internals, the PostHog ingest rewrite, and
    // static files, unless a file name shows up in a search parameter.
    "/((?!_next|ingest|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run on API and Server Action routes.
    "/(api|trpc)(.*)",
    // Always run under /staff, whatever the last path segment looks like: the
    // static file exclusion above would otherwise let a route named
    // `usage.csv` (spec 0008) skip Clerk entirely, and `auth()` has no
    // middleware context to read.
    "/staff(.*)",
  ],
};
