import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { StaffMenu } from "@/components/staff-menu";

/**
 * The shell every state of `/staff/account` sits in: the glass header with
 * the staff menu, then the page heading with the way back to the board
 * (spec 0018, AC-12). Spec 0004
 * (revised), AC-9. Shared by the page and its skeleton so nothing jumps when
 * one replaces the other, mirroring `SettingsShell`.
 */
export function AccountShell({ children }: { children: React.ReactNode }) {
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
          eyebrow="Signed in"
          title="Your account"
          lede="Who the board says you are, and how you sign in."
        />
        {children}
      </div>
    </AppShell>
  );
}
