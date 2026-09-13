import { CalendarCheck, LockKeyhole, UserRound } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { clerkConfigured } from "@/lib/env";

/** The fixed line under both Clerk cards. Spec 0004, AC-1. */
export const STAFF_ONLY_LINE =
  "This board is for staff. Ask Ella for an invitation if you need one.";

/**
 * The page both auth routes render. Spec 0004, AC-1 and AC-10.
 *
 * Clerk owns the card and every flow inside it (code, password, Google, the
 * invitation ticket, and each error state). This surface owns everything around
 * it: the shell, the heading, a short word on what signing in is for, and the
 * staff only line, which sits beside Clerk's own message and never replaces it.
 */
export function AuthSurface({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  /** The Clerk card. */
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <div className="grid items-start gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-12">
        <div className="flex max-w-prose flex-col gap-6">
          <div className="flex flex-col gap-3">
            <p className="text-label text-primary">Staff</p>
            <h1 className="text-display">{title}</h1>
            <p className="text-body text-muted-foreground">{lede}</p>
          </div>

          <ul className="flex flex-col gap-3">
            <Point icon={CalendarCheck}>
              Keep every court current from your phone or the desk tablet.
            </Point>
            <Point icon={UserRound}>
              Your name goes on every booking and change you make, so the schedule stays
              trustworthy.
            </Point>
            <Point icon={LockKeyhole}>
              Accounts are by invitation only. Nobody Ella has not invited can touch the schedule.
            </Point>
          </ul>
        </div>

        <div className="flex flex-col items-center gap-4 lg:items-stretch">
          {clerkConfigured ? (
            children
          ) : (
            <div
              role="status"
              className="border-border bg-card text-body text-muted-foreground w-full rounded-lg border p-4"
            >
              Sign in is not set up yet. Add the Clerk keys to <code>.env.local</code> and restart
              the dev server.
            </div>
          )}
          <p className="text-caption text-muted-foreground text-center lg:text-left">
            {STAFF_ONLY_LINE}
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function Point({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
}) {
  return (
    <li className="text-body flex items-start gap-3">
      <span className="bg-secondary text-secondary-foreground mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span>{children}</span>
    </li>
  );
}
