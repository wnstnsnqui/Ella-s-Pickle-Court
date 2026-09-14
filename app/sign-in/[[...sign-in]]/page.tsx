import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthSurface } from "@/components/auth-surface";
import { clerkConfigured } from "@/lib/env";

/**
 * Staff sign in. Spec 0004, AC-1, AC-4 and AC-10.
 *
 * Clerk's `<SignIn />` handles the email code, the password, Google, and every
 * error state, including refusing an address that was never invited. The
 * catch all segment is Clerk's: it routes its own steps under this path.
 */
export const metadata: Metadata = {
  title: "Staff sign in",
  description: "Sign in to keep the court schedule current.",
  robots: { index: false, follow: false },
};

export default async function SignInPage() {
  // A signed in person has no business here: straight to the staff board.
  if (clerkConfigured) {
    const { isAuthenticated } = await auth();
    if (isAuthenticated) redirect("/staff");
  }

  return (
    <AuthSurface
      title="Sign in"
      lede="Use your email and a one time code, your password, or Google. You stay signed in on this device for up to 30 days."
    >
      <SignIn />
    </AuthSurface>
  );
}
