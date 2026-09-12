import { ClerkProvider } from "@clerk/nextjs";

import { clerkConfigured } from "@/lib/env";

/**
 * Wraps the app in Clerk, but only once Clerk keys exist. See `clerkConfigured`.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  if (!clerkConfigured) return <>{children}</>;
  return <ClerkProvider>{children}</ClerkProvider>;
}
