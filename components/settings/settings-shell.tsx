import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { StaffMenu } from "@/components/staff-menu";
import { Button } from "@/components/ui/button";

/**
 * The shell every state of the settings page sits in: the brand band with the
 * staff menu, a strip with the way back to the schedule, and the page title.
 * Spec 0007, AC-2. Shared by the page, its skeleton and its error state so
 * nothing jumps when one replaces another.
 */
export function SettingsShell({ children }: { children: React.ReactNode }) {
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
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-2">
        <div>
          <h1 className="text-display">Settings</h1>
          <p className="text-body text-muted-foreground mt-1">
            The courts and the hours the venue is open. Every change reaches both boards straight
            away, so nobody has to refresh.
          </p>
        </div>
        {children}
      </div>
    </AppShell>
  );
}
