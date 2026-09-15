import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { StaffMenu } from "@/components/staff-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

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
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  /** The page's own hidden h1, so the document outline still starts right. */
  heading: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <AppShell
      staff={
        <Suspense fallback={null}>
          <StaffMenu />
        </Suspense>
      }
    >
      <h1 className="sr-only">{heading}</h1>
      <Empty className="border-border bg-card my-8 rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription className="flex flex-col items-center gap-3">
            {children}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </AppShell>
  );
}
