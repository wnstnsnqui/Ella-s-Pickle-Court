"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

import { FormFooter } from "./form-pieces";

/**
 * Sign out every other device, on the account page. Spec 0004 (revised),
 * AC-9. The same `revokeOtherSessions` a password change does, offered on
 * its own for the person who left the shared tablet signed in.
 */
export function OtherDevices() {
  const [pending, setPending] = useState(false);

  async function revoke() {
    setPending(true);
    const result = await authClient.revokeOtherSessions();
    setPending(false);
    if (result.error) {
      toast.error("Could not sign out your other devices. Try again in a moment.");
      return;
    }
    toast.success("Every other device has been signed out.");
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-muted-foreground max-w-prose">
        Left yourself signed in on the desk tablet or somebody else&apos;s phone? This signs out
        every session but this one.
      </p>
      <FormFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void revoke()}>
          {pending ? "Signing out" : "Sign out other devices"}
        </Button>
      </FormFooter>
    </div>
  );
}
