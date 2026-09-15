import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { StaffMenu } from "@/components/staff-menu";
import { Button } from "@/components/ui/button";

/**
 * The shell every state of the usage report sits in. Spec 0008, AC-1.
 * Mirrors `SettingsShell`: the brand band with the staff menu, a strip with
 * the way back to the schedule, and the page title.
 */
export function ReportsShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      toolbar={
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/staff">
            <ArrowLeft aria-hidden="true" />
            Schedule
          </Link>
        </Button>
      }
      staff={
        <Suspense fallback={null}>
          <StaffMenu />
        </Suspense>
      }
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-2">
        <div>
          <h1 className="text-display">Reports</h1>
          <p className="text-body text-muted-foreground mt-1">
            Which hours and days are busy, over a range you choose.
          </p>
        </div>
        {children}
      </div>
    </AppShell>
  );
}
