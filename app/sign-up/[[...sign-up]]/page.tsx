import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthSurface } from "@/components/auth-surface";
import { clerkConfigured } from "@/lib/env";

/**
 * Creating a staff account from an invitation. Spec 0004, AC-1 and AC-10.
 *
 * Only reachable in practice with the `__clerk_ticket` Clerk puts on the
 * invitation link: sign up is Restricted in the Clerk dashboard, so without a
 * ticket Clerk refuses with its own message and the staff only line sits beside it.
 */
export const metadata: Metadata = {
  title: "Create your staff account",
  description: "Accept your invitation and create your staff account.",
  robots: { index: false, follow: false },
};

export default async function SignUpPage() {
  if (clerkConfigured) {
    const { isAuthenticated } = await auth();
    if (isAuthenticated) redirect("/");
  }

  return (
    <AuthSurface
      title="Create your account"
      lede="You are here from an invitation. Choose how you will sign in from now on, and you will land on the board with your name in the header."
    >
      <SignUp />
    </AuthSurface>
  );
}
