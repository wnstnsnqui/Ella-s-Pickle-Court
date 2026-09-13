import { ArrowRight, Palette } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { StateLegend } from "@/components/schedule/state-legend";
import { StaffMenu } from "@/components/staff-menu";
import { Button } from "@/components/ui/button";
import { VENUE_NAME, VENUE_TAGLINE } from "@/lib/venue";

/**
 * A holding page, not the board. Feature 7 owns the real public schedule and
 * replaces this file; spec 0003 only gives it the shell, the type and the legend
 * so the front door is not a bare sentence in the meantime.
 */
export default function Home() {
  return (
    <AppShell
      // Streams: the board never waits on the staff row (spec 0004, invariant 3a).
      staff={
        <Suspense fallback={null}>
          <StaffMenu />
        </Suspense>
      }
    >
      <div className="flex flex-col gap-8 py-8">
        <div className="flex max-w-prose flex-col gap-3">
          <h1 className="text-display">{VENUE_NAME}</h1>
          <p className="text-body text-muted-foreground">{VENUE_TAGLINE}</p>
          <p className="text-body text-muted-foreground">
            The live schedule is not open yet. When it is, this page will show every court hour by
            hour, updating by itself, with no sign in and nothing to install.
          </p>
        </div>

        <div className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-title">How the board will read</h2>
          <StateLegend />
          <p className="text-caption text-muted-foreground">
            Each hour on each court says one of these three things. Every one carries a shape as
            well as a colour, so the board works in glare and works if you do not see colour the way
            most people do.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/design">
              <Palette aria-hidden="true" data-icon="inline-start" />
              The design system
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
