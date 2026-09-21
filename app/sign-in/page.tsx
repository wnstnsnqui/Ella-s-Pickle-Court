import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/sign-in-form";
import { AuthSurface } from "@/components/auth-surface";
import { currentSession } from "@/lib/auth/session";
import { STAFF_HOME } from "@/lib/auth/constants";
import { safeRedirect } from "@/lib/auth/schemas";

/**
 * Staff sign in. Spec 0004 (revised), AC-4, AC-16.
 *
 * `redirect` is where `proxy.ts` wanted to send the person before it found no
 * session; only a same origin path is honoured. `reset=1` is the reset page
 * handing over after a password change.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff sign in",
  description: "Sign in to keep the court schedule current.",
  robots: { index: false, follow: false },
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  // A signed in person has no business here: straight to the staff board.
  if (await currentSession()) redirect(STAFF_HOME);

  const params = await searchParams;
  const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : null);
  const target = safeRedirect(one(params.redirect), STAFF_HOME);
  const initialError = one(params.reset) ? "reset" : null;

  return (
    <AuthSurface
      title="Sign in"
      lede="Use your username and password. You stay signed in on this device for up to 30 days."
    >
      <SignInForm redirect={target} initialError={initialError} />
    </AuthSurface>
  );
}
