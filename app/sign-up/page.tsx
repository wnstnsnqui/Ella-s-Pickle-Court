import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CreateAccountForm } from "@/components/auth/create-account-form";
import { LinkNotPending } from "@/components/auth/link-not-pending";
import { AuthSurface } from "@/components/auth-surface";
import { STAFF_HOME } from "@/lib/auth/constants";
import { countAuthUsers } from "@/lib/auth/pool";
import { currentSession } from "@/lib/auth/session";
import { authConfigured } from "@/lib/env";

/**
 * The bootstrap door. Spec 0004 (revised), AC-2.
 *
 * While Better Auth's `user` table is empty this shows the form that creates
 * the first account, which the hook allows only for `BOOTSTRAP_OWNER_USERNAME`
 * and which `ensure_staff()` makes the owner. Once one user exists the door is
 * closed: the page shows only the staff only line, and an account is made
 * through a link at `/sign-up/[token]`. The count is read per request through
 * the auth pool, never cached.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create the first staff account",
  description: "Set up the owner's account for the court schedule.",
  robots: { index: false, follow: false },
};

export default async function SignUpPage() {
  if (await currentSession()) redirect(STAFF_HOME);

  let open = false;
  if (authConfigured) {
    try {
      open = (await countAuthUsers()) === 0;
    } catch (error) {
      console.error(`sign-up: could not count users: ${String(error)}`);
    }
  }

  if (!open) {
    return (
      <AuthSurface
        title="Create your account"
        lede="Accounts are made from a link. Open the one Ella sent you, and your account is created there."
      >
        <LinkNotPending title="This page needs a link" />
      </AuthSurface>
    );
  }

  return (
    <AuthSurface
      title="Create the first account"
      lede="No account exists yet. The first one becomes the owner, and only the bootstrap username can make it."
    >
      <CreateAccountForm mode={{ kind: "bootstrap" }} />
    </AuthSurface>
  );
}
