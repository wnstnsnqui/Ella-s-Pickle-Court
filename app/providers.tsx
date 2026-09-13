import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";

import { clerkConfigured } from "@/lib/env";

/**
 * Wraps the app in Clerk, but only once Clerk keys exist. See `clerkConfigured`.
 *
 * The shadcn theme reads the same CSS variables as the rest of the design system
 * (`--card`, `--primary`, `--input`, `--ring`), so the sign in card follows the
 * tokens in both themes with nothing mapped by hand (spec 0004, AC-10). The few
 * variables below are the ones the theme points at Tailwind defaults this
 * project does not emit, so they are named against our own tokens instead.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  if (!clerkConfigured) return <>{children}</>;
  return (
    <ClerkProvider
      appearance={{
        theme: shadcn,
        variables: {
          colorModalBackdrop: "var(--overlay)",
          fontFamily: "var(--font-sans)",
          fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 600 },
          borderRadius: "var(--radius-md)",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
