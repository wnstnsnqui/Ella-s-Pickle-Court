/**
 * Server side PostHog wiring. Spec 0009, AC-6, AC-9.
 *
 * `register()` and `onRequestError` are Next.js convention exports
 * (`node_modules/next/dist/docs`); Next calls both, nothing here is imported
 * directly. `onRequestError` runs outside any request store, so the session
 * is read from the raw request headers with `auth.api.getSession()` rather
 * than through `currentSession()`, for attribution only (spec 0004, AC-13).
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

  const { posthogConfigured, authConfigured } = await import("@/lib/env");
  if (!posthogConfigured) return;

  const { analyticsServer } = await import("@/lib/analytics/server");
  const posthog = analyticsServer();
  if (!posthog) return;

  let distinctId: string | undefined;
  if (authConfigured) {
    try {
      const { auth } = await import("@/lib/auth");
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers ?? {})) {
        if (typeof value === "string") headers.set(name, value);
        else if (Array.isArray(value)) headers.set(name, value.join(", "));
      }
      const session = await auth.api.getSession({ headers });
      distinctId = session?.user.id;
    } catch {
      // Attribution only: an unreadable session never stops the capture.
    }
  }

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
