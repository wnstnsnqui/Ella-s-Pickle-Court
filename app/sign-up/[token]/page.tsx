import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CreateAccountForm } from "@/components/auth/create-account-form";
import { LinkNotPending } from "@/components/auth/link-not-pending";
import { AuthSurface } from "@/components/auth-surface";
import { STAFF_HOME } from "@/lib/auth/constants";
import { hashLinkToken } from "@/lib/auth/invite-cookie";
import { peekStaffInvite } from "@/lib/auth/pool";
import { linkTokenSchema } from "@/lib/auth/schemas";
import { currentSession } from "@/lib/auth/session";
import { authConfigured } from "@/lib/env";

/**
 * Redeem an invite link. Spec 0004 (revised), AC-1, AC-16.
 *
 * The page peeks the link through the auth pool before rendering anything,
 * so a used, revoked or expired link gets the plain message and no form.
 * Nothing is claimed here: the claim happens inside Better Auth's hook when
 * the account is actually created, once, atomically.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create your staff account",
  description: "Open your link and create your staff account.",
  robots: { index: false, follow: false },
};

export default async function RedeemInvitePage({ params }: PageProps<"/sign-up/[token]">) {
  if (await currentSession()) redirect(STAFF_HOME);

  const { token } = await params;

  let pending = false;
  const parsedToken = linkTokenSchema.safeParse(token);
  if (parsedToken.success && authConfigured) {
    try {
      pending = (await peekStaffInvite(hashLinkToken(parsedToken.data)))?.kind === "invite";
    } catch (cause) {
      console.error(`sign-up/[token]: could not check the link: ${String(cause)}`);
    }
  }

  if (!pending) {
    return (
      <AuthSurface
        title="Create your account"
        lede="This link is not one that can be used right now."
      >
        <LinkNotPending title="This link cannot be used" />
      </AuthSurface>
    );
  }

  return (
    <AuthSurface
      title="Create your account"
      lede="You are here from Ella's link. Choose the username and password you will sign in with from now on, and you will land on the board with your name in the header."
    >
      <CreateAccountForm mode={{ kind: "invite", token: parsedToken.data as string }} />
    </AuthSurface>
  );
}
