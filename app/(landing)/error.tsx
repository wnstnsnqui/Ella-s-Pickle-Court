"use client";

import { useEffect, useRef } from "react";

import { Hero } from "@/components/landing/hero";
import { LandingHeader } from "@/components/landing/landing-header";
import { MessageCard } from "@/components/landing/message-card";
import { showReadFailedToast } from "@/components/landing/notices";
import { captureBrowserException } from "@/lib/analytics/browser";

/**
 * The landing page's own error boundary. Spec 0013, AC-26.
 *
 * The front door never shows an error, so a crash anywhere in the page lands
 * here rather than on the site wide `app/error.tsx`: the top bar, the hero
 * without its board, and the message card, with the same one toast a failed
 * read shows. The error goes to PostHog and the console; no message, code or
 * digest reaches the screen (AC-10). Try again asks Next to render the page
 * again from the server.
 */
export default function LandingError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const reported = useRef<Error | null>(null);

  useEffect(() => {
    if (reported.current === error) return;
    reported.current = error;
    captureBrowserException(error);
    console.error("landing: the page failed to render", error);
    // A tick later, so the root layout's Toaster is listening.
    setTimeout(showReadFailedToast, 0);
  }, [error]);

  return (
    <div data-landing className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="flex-1">
        <Hero board={null} stats={{ courts: null, earliestOpen: null, hourlyRate: null }} />
        <section id="book" aria-label="Book a court" className="bg-muted mt-10 scroll-mt-16 py-20">
          <div className="mx-auto w-full max-w-2xl px-4">
            <MessageCard onTryAgain={retry} />
          </div>
        </section>
      </main>
    </div>
  );
}
