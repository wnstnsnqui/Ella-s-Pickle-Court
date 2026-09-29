"use client";

import { ArrowsClockwiseIcon, WarningIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * One notice for a failed usage read, day read or CSV read. Spec 0008, AC-10:
 * nothing partial ever shows beside it. Mirrors `SettingsError`.
 */
export function ReportError({ message }: { message: string }) {
  const router = useRouter();
  return (
    <Alert variant="destructive" role="alert">
      <WarningIcon aria-hidden="true" />
      <AlertTitle>The report did not load</AlertTitle>
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
