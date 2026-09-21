"use client";

import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { firstName } from "@/components/staff/format";
import { Button } from "@/components/ui/button";
import { resetIdentity } from "@/lib/analytics/browser";
import { authClient } from "@/lib/auth-client";
import { ACCOUNT_PAGE } from "@/lib/auth/constants";

/**
 * The two client pieces of the staff menu. Spec 0004 (revised), AC-4, AC-9.
 *
 * Both are our own buttons on our own tokens. The name goes to the account
 * page (details, name, password, devices); sign out ends the Better
 * Auth session and lands back on the public board.
 */

/** The signed in person's first name. Pressing it opens the account page. */
export function AccountButton({ name }: { name: string }) {
  return (
    <Button asChild variant="ghost" size="sm" title={`Your account (${name})`}>
      <Link href={ACCOUNT_PAGE}>
        <UserRound aria-hidden="true" />
        <span className="max-w-32 truncate">{firstName(name)}</span>
        <span className="sr-only">, your account</span>
      </Link>
    </Button>
  );
}

/**
 * Ends the session and returns to `/`. Better Auth unreachable → a toast,
 * the button stays.
 *
 * Lives on the account page for an active staff member, and in the header
 * only for someone who cannot reach that page (switched off, or the staff row
 * could not be read), so a person stuck on a shared tablet can always leave.
 */
export function SignOutButton({
  className,
  variant = "ghost",
}: {
  className?: string;
  variant?: "ghost" | "outline";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    const result = await authClient.signOut();
    if (result.error) {
      toast.error("Could not sign out. Check your connection and try again.");
      setPending(false);
      return;
    }
    resetIdentity();
    router.replace("/");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      onClick={() => void handleSignOut()}
      disabled={pending}
      title="Sign out"
      className={className}
    >
      <LogOut aria-hidden="true" />
      <span>Sign out</span>
    </Button>
  );
}
