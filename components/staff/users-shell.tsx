import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { StaffMenu } from "@/components/staff-menu";

/**
 * The shell every state of `/staff/admin/users` sits in. Spec 0012, AC-1.
 * Shared by the page, its skeleton and its error state so nothing jumps when
 * one replaces another, mirroring `SettingsShell`.
 */
export function UsersShell({ children }: { children: React.ReactNode }) {
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
          eyebrow="Team"
          title="Staff accounts"
          lede="Every signed in account, its role and whether it is switched on. Every change is confirmed first and recorded."
        />
        {children}
      </div>
    </AppShell>
  );
}
