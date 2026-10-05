import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { BOARD_PAGE, BoardPageSkeleton } from "@/components/board-card";
import { StaffMenu } from "@/components/staff-menu";

/**
 * The staff board's shape while the day is on its way.
 *
 * `/staff` renders per request, so without this file a tap on the "Schedule"
 * link from settings, reports, users or account showed nothing until the
 * server had answered, and the app looked as if it had not registered the
 * tap. With it, Next swaps the page in at once and streams the real board
 * into place, in the board card's shape (spec 0018).
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
      <h1 className="sr-only">Staff schedule</h1>
      <p role="status" className="sr-only">
        Loading the schedule
      </p>
      <BoardPageSkeleton summary />
    </AppShell>
  );
}
