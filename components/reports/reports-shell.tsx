import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { StaffMenu } from "@/components/staff-menu";

/**
 * The shell every state of the usage report sits in. Spec 0008, AC-1.
 * Mirrors `SettingsShell`: the glass header with the staff menu,
 * then the page heading with the way back to the board (spec 0018, AC-12).
 */
export function ReportsShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      muted
      staff={
        <Suspense fallback={null}>
          <StaffMenu />
        </Suspense>
      }
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <PageHeading
          eyebrow="Usage"
          title="Reports"
          lede="Which hours and days are busy, over a range you choose."
        />
        {children}
      </div>
    </AppShell>
  );
}
