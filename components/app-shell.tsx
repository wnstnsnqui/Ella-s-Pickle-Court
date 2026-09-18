import { Show } from "@clerk/nextjs";
import Link from "next/link";

import { NavMenu } from "@/components/nav-menu";
import { Wordmark } from "@/components/wordmark";
import { clerkConfigured } from "@/lib/env";
import { cn } from "@/lib/utils";

/**
 * The one shell both boards sit in. Spec 0003, AC-10.
 *
 * It is a server component and it renders on the server, so the first paint is
 * the real page rather than a shrug that fills in later (invariant 6).
 *
 * `staff` is a slot rather than a prop bag: the shell knows nothing about what a
 * staff control does, only that it renders solely when Clerk reports a signed in
 * user. That gate is a convenience, not a control. Nothing here decides who may
 * write; the row level security policies from spec 0002 do, and they would refuse
 * a write from a signed out visitor whatever this markup said.
 */
export function AppShell({
  children,
  toolbar,
  staff,
  className,
}: {
  children: React.ReactNode;
  /** Day navigation and the live indicator: the per board strip under the brand. */
  toolbar?: React.ReactNode;
  /** Controls only a signed in staff member ever sees. */
  staff?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-border sticky top-0 z-30 border-b shadow-sm">
        {/* The brand band, golden. */}
        <div className="bg-brand text-brand-foreground">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
            <Wordmark />
            {staff && clerkConfigured ? (
              <div className="flex flex-wrap items-center gap-2">
                {/* Signed in: everything collapses behind one menu below
                    1024px, where showing every item inline wraps and
                    crowds the band; at 1024px and up they stay inline. */}
                <Show when="signed-in">
                  <div className="hidden items-center gap-2 lg:flex">{staff}</div>
                  <NavMenu>{staff}</NavMenu>
                </Show>
              </div>
            ) : null}
          </div>
        </div>
        {toolbar ? (
          <div className="bg-background">
            <div className="mx-auto w-full max-w-5xl px-4 py-2">{toolbar}</div>
          </div>
        ) : null}
      </header>

      <main className={cn("mx-auto w-full max-w-5xl flex-1 px-4 py-4", className)}>{children}</main>

      <footer className="border-border text-caption text-muted-foreground mt-8 border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4">
          <p>All times are venue time, Asia/Manila.</p>
          <div className="flex items-center gap-4">
            <Link
              href="/privacy"
              className="text-foreground rounded-sm underline-offset-4 hover:underline"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-foreground rounded-sm underline-offset-4 hover:underline"
            >
              Terms
            </Link>
            {/* The one quiet door for staff. A signed in person already has the menu above. */}
            {clerkConfigured ? (
              <Show when="signed-out">
                <Link
                  href="/sign-in"
                  className="text-foreground rounded-sm underline-offset-4 hover:underline"
                >
                  Staff sign in
                </Link>
              </Show>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  );
}
