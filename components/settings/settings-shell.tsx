import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { StaffMenu } from "@/components/staff-menu";

/**
 * The shell every state of the settings page sits in: the glass header with
 * the staff menu, then the page heading with the way back to the board
 * (spec 0018, AC-12).
 * Spec 0007, AC-2. Shared by the page, its skeleton and its error state so
 * nothing jumps when one replaces another.
 */
export function SettingsShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      muted
      staff={
        <Suspense fallback={null}>
          <StaffMenu />
        </Suspense>
      }
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <PageHeading
          eyebrow="Venue"
          title="Settings"
          lede="The courts and the hours the venue is open. Every change reaches both boards straight away, so nobody has to refresh."
        />
        {children}
      </div>
    </AppShell>
  );
}
