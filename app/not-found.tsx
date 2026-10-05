import { CompassIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { NoticeCard } from "@/components/notice-card";
import { StaffMenu } from "@/components/staff-menu";
import { Button } from "@/components/ui/button";

/**
 * The route level not-found boundary, paired with `error.tsx`. Spec 0009, AC-6.
 *
 * A Server Component, unlike `error.tsx`: there is no error object or `reset`
 * handler here, just a path that matched no route. It sits in the shell like
 * every other page (spec 0018, AC-13), its message a card on the muted page.
 */
export default function NotFound() {
  return (
    <AppShell
      muted
      staff={
        <Suspense fallback={null}>
          <StaffMenu />
        </Suspense>
      }
    >
      <h1 className="sr-only">Court schedule</h1>
      <NoticeCard icon={CompassIcon} title="Page not found">
        <p>That page doesn&apos;t exist. Check the link, or head back to the board.</p>
        <Button asChild variant="outline" className="press h-12 rounded-full px-5">
          <Link href="/schedule">Back to today</Link>
        </Button>
      </NoticeCard>
    </AppShell>
  );
}
