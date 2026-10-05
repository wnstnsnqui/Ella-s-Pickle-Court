import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { BOARD_PAGE, BoardPageSkeleton } from "@/components/board-card";
import { StaffMenu } from "@/components/staff-menu";

/**
 * The board's shape while a day is on its way. Spec 0006, AC-12: moving between
 * days shows this rather than a blank page or the old day frozen in place.
 */
export default function Loading() {
  return (
    <AppShell
      muted
      className={BOARD_PAGE}
      staff={
        <Suspense fallback={null}>
          <StaffMenu />
        </Suspense>
      }
    >
      <h1 className="sr-only">Court schedule</h1>
      <p role="status" className="sr-only">
        Loading the schedule
      </p>
      <BoardPageSkeleton />
    </AppShell>
  );
}
