import Link from "next/link";

import { NavMenu } from "@/components/nav-menu";
import { Wordmark } from "@/components/wordmark";
import { currentSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/**
 * The one shell every working screen sits in. Spec 0003, AC-10, restyled by
 * spec 0018, AC-3.
 *
 * It is a server component and it renders on the server, so the first paint is
 * the real page rather than a shrug that fills in later (invariant 6).
 *
 * The header is the landing page's glass bar: the page scrolls under it, clear
 * at the top and given a hairline once content passes beneath it
 * (`[data-shell-header]` in `app/globals.css`, a scroll timeline, no script).
 * It holds the mark and, signed in, the staff links; a board's own controls
 * live in its board card, never up here.
 *
 * `staff` is a slot rather than a prop bag: the shell knows nothing about what a
 * staff control does, only that it renders solely when there is a Better Auth
 * session (spec 0004, read once per request through `currentSession()`). That
 * gate is a convenience, not a control. Nothing here decides who may write; the
 * row level security policies from spec 0002 do, and they would refuse a write
 * from a signed out visitor whatever this markup said.
 */
export async function AppShell({
  children,
  staff,
  muted = false,
  className,
}: {
  children: React.ReactNode;
  /** Controls only a signed in staff member ever sees. */
  staff?: React.ReactNode;
  /** The page sits on the muted grey, as the landing's booking band does, so its cards stand out. */
  muted?: boolean;
  className?: string;
}) {
  const signedIn = (await currentSession()) !== null;
  return (
    <div
      className={cn(
        // Every button on a working screen presses (spec 0018, AC-4), named once.
        "[&_[data-slot=button]]:press flex min-h-svh flex-col",
        muted && "bg-muted",
      )}
    >
      <header data-shell-header className="surface-glass sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4">
          <Wordmark />
          {staff && signedIn ? (
            <nav aria-label="Staff" className="flex items-center gap-1">
              {/* Signed in: every link folds behind one menu below 1024px,
                  where showing them inline crowds the bar; from 1024px they
                  sit inline as pills. */}
              <div className="hidden items-center gap-1 lg:flex">{staff}</div>
              <NavMenu>{staff}</NavMenu>
            </nav>
          ) : null}
        </div>
      </header>

      <main className={cn("mx-auto w-full max-w-6xl flex-1 px-4 py-6", className)}>{children}</main>

      <footer className="border-border text-caption text-muted-foreground border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-end gap-x-6 gap-y-2 px-4 py-4">
          <div className="flex items-center gap-1">
            <FooterLink href="/privacy">Privacy</FooterLink>
            <FooterLink href="/terms">Terms</FooterLink>
            {/* The one quiet door for staff. A signed in person already has the menu above. */}
            {signedIn ? null : <FooterLink href="/sign-in">Staff sign in</FooterLink>}
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-foreground rounded-sm px-2 py-2 underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}
