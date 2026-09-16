/**
 * Server side PostHog wiring. Spec 0009, AC-6, AC-9.
 *
 * `register()` and `onRequestError` are Next.js convention exports
 * (`node_modules/next/dist/docs`); Next calls both, nothing here is imported
 * directly. `onRequestError` runs outside any request store, so Clerk's
 * `auth()` is not callable here; `clerkSubjectFromCookie()` reads the Clerk
 * id straight off the raw cookie header instead, for attribution only.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { posthogConfigured } = await import("@/lib/env");
  if (!posthogConfigured) return;

  const { registerShutdownHandler } = await import("@/lib/analytics/register-node");
  registerShutdownHandler();
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { posthogConfigured } = await import("@/lib/env");
  if (!posthogConfigured) return;

  const { analyticsServer, clerkSubjectFromCookie } = await import("@/lib/analytics/server");
  const posthog = analyticsServer();
  if (!posthog) return;

  const cookieHeader = request.headers?.cookie;
  const cookieString = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  const distinctId = clerkSubjectFromCookie(cookieString);

  try {
    posthog.captureException(err, distinctId, {
      route_path: context.routePath,
      route_type: context.routeType,
      http_method: request.method,
    });
  } catch {
    console.warn("analytics: onRequestError failed to capture.");
  }
}
