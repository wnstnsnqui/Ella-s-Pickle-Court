"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect } from "react";
import posthog from "posthog-js";

import { NoticeCard } from "@/components/notice-card";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { posthogConfigured } from "@/lib/env";

/**
 * The route level error boundary. Spec 0009, AC-6.
 *
 * A Client Component, so it cannot render `BoardNotice` (a Server Component
 * that fetches the signed in staff member through `AppShell`); this renders
 * the same `NoticeCard` under a copy of the glass header instead, without the
 * shell, so a broken layout or a broken staff read can never take this
 * boundary down with it (spec 0018, AC-13).
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
    <div className="bg-muted [&_[data-slot=button]]:press flex min-h-svh flex-col">
      {/* The glass header's look, without the shell: the shell reads the
          session, and this boundary must stand even when that is what broke. */}
      <header data-shell-header className="surface-glass sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-4">
          <Wordmark />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <h1 className="sr-only">Court schedule</h1>
        <NoticeCard icon={WarningCircleIcon} title="Something went wrong on our side">
          <p>Try again, or come back to the board.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="ink" onClick={() => reset()} className="press h-12 px-5">
              Try again
            </Button>
            <Button asChild variant="outline" className="press h-12 rounded-full px-5">
              <Link href="/schedule">Back to today</Link>
            </Button>
          </div>
          {error.digest && <p className="text-caption">Reference: {error.digest}</p>}
        </NoticeCard>
      </main>
    </div>
  );
}
