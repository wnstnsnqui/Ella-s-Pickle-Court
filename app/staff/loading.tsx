import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { GridSkeleton } from "@/components/schedule/grid-skeleton";
import { StaffMenu } from "@/components/staff-menu";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The staff board's shape while the day is on its way.
 *
 * `/staff` renders per request, so without this file a tap on the "Schedule"
 * link from settings, reports, users or account showed nothing until the
 * server had answered, and the app looked as if it had not registered the
 * tap. With it, Next swaps the page in at once and streams the real board
 * into place. The toolbar placeholder is the `DayNav`'s footprint: two icon
 * buttons, the day label, and the calendar button, so nothing jumps when the
 * real strip arrives.
 */
export default function Loading() {
  return (
    <AppShell
      toolbar={
        <div aria-hidden="true" className="flex w-fit items-center gap-2">
          <Skeleton className="size-9 rounded-md" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="size-9 rounded-md" />
          <Skeleton className="size-9 rounded-md" />
        </div>
      }
      staff={
        <Suspense fallback={null}>
          <StaffMenu />
        </Suspense>
      }
    >
      <h1 className="sr-only">Staff schedule</h1>
      <p role="status" className="sr-only">
        Loading the schedule
      </p>
      <GridSkeleton className="mt-4" />
    </AppShell>
  );
}
