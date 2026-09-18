"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * The staff list read failed. Spec 0012, AC-2. Retry is `router.refresh()`,
 * matching `SettingsError`.
 */
export function UsersError({ message }: { message: string }) {
  const router = useRouter();
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>The staff list did not load</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => router.refresh()}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
