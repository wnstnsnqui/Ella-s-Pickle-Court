"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import posthog from "posthog-js";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { posthogConfigured } from "@/lib/env";

/**
 * The route level error boundary. Spec 0009, AC-6.
 *
 * A Client Component, so it cannot render `BoardNotice` (a Server Component
 * that fetches the signed in staff member through `AppShell`); this renders
 * the same `Empty` primitives from spec 0003 directly instead, without the
 * shell, so a broken layout or a broken staff read can never take this
 * boundary down with it.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (posthogConfigured) posthog.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <h1 className="sr-only">Court schedule</h1>
      <Empty className="border-border bg-card max-w-md rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlert aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Something went wrong on our side</EmptyTitle>
          <EmptyDescription className="flex flex-col items-center gap-3">
            <p>Try again, or come back to the board.</p>
            <div className="flex gap-2">
              <Button type="button" onClick={() => reset()}>
                Try again
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Back to today</Link>
              </Button>
            </div>
            {error.digest && (
              <p className="text-muted-foreground text-xs">Reference: {error.digest}</p>
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
