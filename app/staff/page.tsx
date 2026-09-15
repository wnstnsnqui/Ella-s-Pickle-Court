import { auth } from "@clerk/nextjs/server";
import { CircleAlert, UserRoundX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { BoardNotice } from "@/components/board-notice";
import { StaffBoard } from "@/components/staff/staff-board";
import { StaffScheduleProvider } from "@/components/staff/staff-schedule-context";
import { StaffToolbar } from "@/components/staff/staff-toolbar";
import { StaffMenu } from "@/components/staff-menu";
import { Button } from "@/components/ui/button";
import { getStaffSchedule } from "@/lib/schedule/queries";
import { currentStaff } from "@/lib/staff";
import { VENUE_NAME } from "@/lib/venue";

/**
 * The staff board. Spec 0005, AC-1, AC-2 and AC-12.
 *
 * `proxy.ts` has already sent a signed out visitor to `/sign-in`, so this page
 * only ever meets a signed in person. What it shows them is decided by
 * `currentStaff()`: an inactive account gets the switched off notice and no
 * grid, a row that could not be read gets the could not load notice, and only
 * an active staff member gets the day, read with their own token so the
 * policies decide what comes back. The page renders per request; a board is
 * worth nothing stale.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff schedule",
  description: `Keep the ${VENUE_NAME} court schedule current.`,
  robots: { index: false, follow: false },
};

export default async function StaffPage({ searchParams }: PageProps<"/staff">) {
  const { date: rawDate } = await searchParams;
  const date = typeof rawDate === "string" ? rawDate : undefined;

  const current = await currentStaff();

  if (current.kind === "signed_out") {
    // The proxy makes this unreachable; said plainly rather than left to chance.
    return (
      <BoardNotice heading="Staff schedule" icon={CircleAlert} title="Sign in to see the schedule">
        <Button asChild>
          <Link href="/sign-in">Staff sign in</Link>
        </Button>
      </BoardNotice>
    );
  }

  if (current.kind === "error") {
    return (
      <BoardNotice heading="Staff schedule" icon={CircleAlert} title="Could not load your account">
        The venue database did not answer in time. Reload in a moment, and if it keeps happening
        tell Ella.
      </BoardNotice>
    );
  }

  if (!current.staff.isActive) {
    return (
      <BoardNotice heading="Staff schedule" icon={UserRoundX} title="Your account is switched off">
        You are signed in, but this account can no longer change the schedule. Ask Ella if you think
        that is a mistake. You can still sign out from the header.
      </BoardNotice>
    );
  }

  const [{ userId }, result] = await Promise.all([auth(), getStaffSchedule(date)]);

  if (!result.ok) {
    return (
      <BoardNotice heading="Staff schedule" icon={CircleAlert} title="That day could not be shown">
        <p>{result.error.message}</p>
        <Button asChild variant="outline">
          <Link href="/staff">Back to today</Link>
        </Button>
      </BoardNotice>
    );
  }

  return (
    <StaffScheduleProvider
      // A new day is a new board: every piece of browser state starts fresh.
      key={result.data.grid.date}
      initial={result.data}
      date={result.data.grid.date}
      viewer={{ clerkUserId: userId ?? "", role: current.staff.role }}
    >
      <AppShell
        toolbar={<StaffToolbar />}
        staff={
          <Suspense fallback={null}>
            <StaffMenu />
          </Suspense>
        }
      >
        <h1 className="sr-only">Staff schedule</h1>
        <StaffBoard />
      </AppShell>
    </StaffScheduleProvider>
  );
}
