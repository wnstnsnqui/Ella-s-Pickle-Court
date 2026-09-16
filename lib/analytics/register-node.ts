import "server-only";

import { analyticsServer } from "./server";

/**
 * The Node.js runtime half of `instrumentation.ts`'s `register()`, in its own
 * module so `process.on` never appears in the Edge Runtime's bundle graph:
 * `register()` only reaches this file behind a `NEXT_RUNTIME === "nodejs"`
 * check, but a dynamic import alone does not stop Turbopack from statically
 * warning about a Node API it can see through a same-file reference.
 */
export function registerShutdownHandler(): void {
  process.on("SIGTERM", () => {
    const posthog = analyticsServer();
    if (!posthog) return;
    void Promise.race([posthog.shutdown(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  });
}
