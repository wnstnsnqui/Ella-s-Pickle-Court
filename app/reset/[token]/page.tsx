import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LinkNotPending } from "@/components/auth/link-not-pending";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { AuthSurface } from "@/components/auth-surface";
import { STAFF_HOME } from "@/lib/auth/constants";
import { hashLinkToken } from "@/lib/auth/invite-cookie";
import { peekStaffInvite } from "@/lib/auth/pool";
import { linkTokenSchema } from "@/lib/auth/schemas";
import { currentSession } from "@/lib/auth/session";
import { authConfigured } from "@/lib/env";

/**
 * Set a new password from a reset link. Spec 0004 (revised), AC-7, AC-16.
 *
 * Peeks first, like the invite page, so the form only ever shows for a
 * pending reset and can name the account it is for. The claim happens in
 * `resetPassword` when the form is submitted.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set a new password",
  description: "Open your reset link and choose a new password.",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({ params }: PageProps<"/reset/[token]">) {
  if (await currentSession()) redirect(STAFF_HOME);

  const { token } = await params;

  let targetUsername: string | null | undefined;
  const parsedToken = linkTokenSchema.safeParse(token);
  if (parsedToken.success && authConfigured) {
    try {
      const link = await peekStaffInvite(hashLinkToken(parsedToken.data));
      if (link?.kind === "reset") targetUsername = link.targetUsername;
    } catch (cause) {
      console.error(`reset/[token]: could not check the link: ${String(cause)}`);
    }
  }

  if (targetUsername === undefined) {
    return (
      <AuthSurface
        title="Set a new password"
        lede="This link is not one that can be used right now."
      >
        <LinkNotPending title="This link cannot be used" />
      </AuthSurface>
    );
  }

  return (
    <AuthSurface
      title="Set a new password"
      lede="Ella made this link for you. Choose a new password, then sign in with it."
    >
      <ResetPasswordForm token={parsedToken.data as string} username={targetUsername} />
    </AuthSurface>
  );
}
