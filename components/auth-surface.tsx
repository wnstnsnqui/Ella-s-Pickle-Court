import type { IconWeight } from "@phosphor-icons/react";
import { CalendarCheckIcon, LockKeyIcon, UserIcon } from "@phosphor-icons/react/ssr";

import { AppShell } from "@/components/app-shell";
import { STAFF_ONLY_LINE } from "@/lib/auth/constants";
import { authConfigured } from "@/lib/env";

export { STAFF_ONLY_LINE };

/**
 * The page every auth route renders. Spec 0004 (revised), AC-1 and AC-16, in
 * the landing look since spec 0018, AC-13.
 *
 * One centred white card on the muted page: the heading and the short word on
 * what signing in is for above it, the form inside it with roomy fields and an
 * ink submit, and under it the staff only line every closed door shows, then
 * the three reasons the door is there. The forms are our own, so this surface
 * owns the whole screen, under the same glass header as every other page.
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
    <AppShell muted>
      <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-6 sm:py-10">
        <div className="flex flex-col gap-2 text-center">
          <p className="text-label text-link tracking-wide uppercase">Staff</p>
          <h1 className="text-display text-balance">{title}</h1>
          <p className="text-body text-muted-foreground text-pretty">{lede}</p>
        </div>

        {/* Fields sized here, never in `form.tsx` or `input.tsx`, which the landing shares (AC-1). */}
        <div className="surface-card p-6 [&_[data-slot=input]]:h-11">
          {authConfigured ? (
            children
          ) : (
            <p role="status" className="text-body text-muted-foreground">
              Sign in is not set up yet. Fill the Better Auth values in <code>.env.local</code> and
              restart the dev server.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-caption text-muted-foreground text-center">{STAFF_ONLY_LINE}</p>
          <ul className="flex flex-col gap-3">
            <Point icon={CalendarCheckIcon}>
              Keep every court current from your phone or the desk tablet.
            </Point>
            <Point icon={UserIcon}>
              Your name goes on every booking and change you make, so the schedule stays
              trustworthy.
            </Point>
            <Point icon={LockKeyIcon}>
              Accounts exist only through a link Ella made. Nobody without one can touch the
              schedule.
            </Point>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}

function Point({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
  children: React.ReactNode;
}) {
  return (
    <li className="text-caption text-muted-foreground flex items-start gap-3">
      <Icon aria-hidden="true" weight="duotone" className="text-foreground size-5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}
