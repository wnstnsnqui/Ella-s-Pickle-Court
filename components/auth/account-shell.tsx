import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { StaffMenu } from "@/components/staff-menu";
import { Button } from "@/components/ui/button";

/**
 * The shell every state of `/staff/account` sits in: the brand band with the
 * staff menu, the way back to the schedule, and the page title. Spec 0004
 * (revised), AC-9. Shared by the page and its skeleton so nothing jumps when
 * one replaces the other, mirroring `SettingsShell`.
 */
export function AccountShell({ children }: { children: React.ReactNode }) {
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
          <h1 className="text-display">Your account</h1>
          <p className="text-body text-muted-foreground mt-1">
            Who the board says you are, and how you sign in.
          </p>
        </div>
        {children}
      </div>
    </AppShell>
  );
}
