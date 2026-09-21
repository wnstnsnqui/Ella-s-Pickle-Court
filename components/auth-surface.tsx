import { CalendarCheck, LockKeyhole, UserRound } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { STAFF_ONLY_LINE } from "@/lib/auth/constants";
import { authConfigured } from "@/lib/env";

export { STAFF_ONLY_LINE };

/**
 * The page every auth route renders. Spec 0004 (revised), AC-1 and AC-16.
 *
 * Left, why signing in exists; right, the card with the form. The forms are
 * our own now (the old provider's cards are gone), so this surface owns the whole
 * screen: the shell with no toolbar, the heading, the short word on what
 * signing in is for, the card the form sits in, and the staff only line
 * under it, which every closed door shows.
 */
export function AuthSurface({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  /** The form, or the message that stands in for one. */
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
              Accounts exist only through a link Ella made. Nobody without one can touch the
              schedule.
            </Point>
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <div className="border-border bg-card rounded-lg border p-6 shadow-sm">
            {authConfigured ? (
              children
            ) : (
              <p role="status" className="text-body text-muted-foreground">
                Sign in is not set up yet. Fill the Better Auth values in <code>.env.local</code>{" "}
                and restart the dev server.
              </p>
            )}
          </div>
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
