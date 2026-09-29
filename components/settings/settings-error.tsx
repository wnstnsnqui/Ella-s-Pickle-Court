"use client";

import { ArrowsClockwiseIcon, WarningIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * The settings read failed. Spec 0007, AC-2. Retry is `router.refresh()`,
 * which runs the server read again rather than reloading the whole page.
 */
export function SettingsError({ message }: { message: string }) {
  const router = useRouter();
  return (
    <Alert variant="destructive" role="alert">
      <WarningIcon aria-hidden="true" />
      <AlertTitle>The settings did not load</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => router.refresh()}>
          <ArrowsClockwiseIcon aria-hidden="true" />
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
