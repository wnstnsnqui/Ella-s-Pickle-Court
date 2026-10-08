import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { cn } from "@/lib/utils";

import { PRESS } from "./press";
import { SectionLink } from "./section-link";

/**
 * Rooted at `/`, so the same bar works from `/booking` (spec 0017, AC-17); on
 * `/` itself they scroll exactly as a bare fragment would.
 */
const LINKS = [
  { href: "/#offers", label: "Offers" },
  { href: "/#book", label: "Book" },
  { href: "/#visit", label: "Visit" },
] as const;

/** Where a player who holds a code finds their booking (spec 0017, AC-17). */
const FIND_BOOKING = { href: "/booking", label: "Find my booking" } as const;

/**
 * The landing page's top bar. A translucent layer the page scrolls under, clear
 * at the top and given a hairline by a scroll timeline once content passes
 * beneath it (`[data-landing-header]` in `app/globals.css`). The call to action
 * stays visible at every width; the section links fold away on a phone.
 * "Find my booking" joins them only while checkout is on, because with it off
 * nobody holds a code.
 */
export function LandingHeader({ findBooking = false }: { findBooking?: boolean }) {
  const links = findBooking ? [...LINKS, FIND_BOOKING] : LINKS;
  return (
    <header
      data-landing-header
      className="sticky top-0 z-40 border-b border-transparent backdrop-blur-xl backdrop-saturate-150"
    >
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4"
      >
        <Wordmark />
        <ul className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <li key={link.href}>
              <SectionLink
                href={link.href}
                className="text-label text-muted-foreground hover:text-foreground hover:bg-muted rounded-full px-3 py-2 transition-colors duration-150"
              >
                {link.label}
              </SectionLink>
            </li>
          ))}
        </ul>
        <Button
          asChild
          className={cn("bg-mark text-mark-foreground hover:bg-mark/90 h-10 px-4", PRESS)}
        >
          <SectionLink href="/#book">
            Book a court
            <ArrowRightIcon aria-hidden="true" weight="bold" data-icon="inline-end" />
          </SectionLink>
        </Button>
      </nav>
    </header>
  );
}
