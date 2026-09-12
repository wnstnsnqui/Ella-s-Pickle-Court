"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * The read failed. Spec 0003, AC-13.
 *
 * It says what went wrong and offers the one thing that ever helps, which is
 * asking again. `role="alert"` because a board that has stopped being true is
 * urgent: a reader must not be left acting on a grid that never loaded.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>The schedule did not load</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
