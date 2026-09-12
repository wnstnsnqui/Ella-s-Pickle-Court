import { Show } from "@clerk/nextjs";

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
      <header className="border-border bg-background sticky top-0 z-30 border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Wordmark />
          {staff && clerkConfigured ? (
            <Show when="signed-in">
              <div className="flex items-center gap-2">{staff}</div>
            </Show>
          ) : null}
        </div>
        {toolbar ? (
          <div className="border-border/70 mx-auto w-full max-w-5xl border-t px-4 py-2">
            {toolbar}
          </div>
        ) : null}
      </header>

      <main className={cn("mx-auto w-full max-w-5xl flex-1 px-4 py-4", className)}>{children}</main>

      <footer className="border-border text-caption text-muted-foreground mt-8 border-t">
        <div className="mx-auto w-full max-w-5xl px-4 py-4">
          <p>All times are venue time, Asia/Manila.</p>
        </div>
      </footer>
    </div>
  );
}
