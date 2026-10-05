import type { IconWeight } from "@phosphor-icons/react";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { NoticeCard } from "@/components/notice-card";
import { StaffMenu } from "@/components/staff-menu";

/**
 * The shell with one message in it, for every state of a board page that is
 * not a grid: a day that cannot be shown, an account that is switched off, a
 * read that failed before anything rendered. Shared by the public and the
 * staff page so the two never drift.
 */
export function BoardNotice({
  icon: Icon,
  heading,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
  /** The page's own hidden h1, so the document outline still starts right. */
  heading: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <AppShell
      muted
      staff={
        <Suspense fallback={null}>
          <StaffMenu />
        </Suspense>
      }
    >
      <h1 className="sr-only">{heading}</h1>
      <NoticeCard icon={Icon} title={title}>
        {children}
      </NoticeCard>
    </AppShell>
  );
}
