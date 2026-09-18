import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { StaffMenu } from "@/components/staff-menu";
import { Button } from "@/components/ui/button";

/**
 * The shell every state of `/staff/admin/users` sits in. Spec 0012, AC-1.
 * Shared by the page, its skeleton and its error state so nothing jumps when
 * one replaces another, mirroring `SettingsShell`.
 */
export function UsersShell({ children }: { children: React.ReactNode }) {
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
          <h1 className="text-display">Staff accounts</h1>
          <p className="text-body text-muted-foreground mt-1">
            Every signed in account, its role and whether it is switched on. Every change is
            confirmed first and recorded.
          </p>
        </div>
        {children}
      </div>
    </AppShell>
  );
}
