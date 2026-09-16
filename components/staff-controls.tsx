"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resetIdentity } from "@/lib/analytics/browser";

/**
 * The two client pieces of the staff menu. Spec 0004, AC-4.
 *
 * Both are our own buttons on our own tokens rather than Clerk's `<UserButton />`,
 * so the header stays on brand. Clerk still owns what happens next: the name
 * opens Clerk's account modal, and sign out ends the Clerk session and lands
 * back on the public board.
 */

/** The signed in person's name. Pressing it opens Clerk's account modal. */
export function AccountButton({ name }: { name: string }) {
  const { openUserProfile } = useClerk();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => openUserProfile()}
      title="Manage your account"
    >
      <UserRound aria-hidden="true" />
      <span className="sr-only sm:not-sr-only sm:max-w-32 sm:truncate">{name}</span>
      <span className="sr-only">, manage your account</span>
    </Button>
  );
}

/**
 * Ends the Clerk session and returns to `/`. Clerk unreachable → a toast, the
 * button stays. Icon only on a phone, where the band holds four controls.
 */
export function SignOutButton() {
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    try {
      resetIdentity();
      await signOut({ redirectUrl: "/" });
    } catch {
      toast.error("Could not sign out. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleSignOut}
      disabled={pending}
      title="Sign out"
    >
      <LogOut aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">Sign out</span>
    </Button>
  );
}
