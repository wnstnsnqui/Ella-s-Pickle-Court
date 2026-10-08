import { Wordmark } from "@/components/wordmark";
import { smsHref, VENUE_ADDRESS, VENUE_MESSENGER_URL, VENUE_NAME } from "@/lib/venue";

import { FOOTER_LINE } from "./content";
import { SectionLink } from "./section-link";

type FooterLink = { href: string; label: string };

/** Section links are rooted at `/`, so the footer works from `/booking` too (spec 0017, AC-17). */
const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Play",
    links: [
      { href: "/#offers", label: "Offers" },
      { href: "/#book", label: "Book a court" },
      { href: "/schedule", label: "Live schedule" },
    ],
  },
  {
    title: "Venue",
    links: [
      { href: "/#visit", label: "Location and hours" },
      { href: VENUE_MESSENGER_URL, label: "Messenger" },
      { href: smsHref(), label: "Text us" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/sign-in", label: "Staff sign in" },
    ],
  },
];

const LINK = "text-body text-muted-foreground hover:text-foreground transition-colors duration-150";

/**
 * The landing page's foot: the mark, a line of voice, and every way onward.
 * "Find my booking" sits under Play only while checkout is on (spec 0017, AC-17).
 */
export function LandingFooter({ findBooking = false }: { findBooking?: boolean }) {
  const columns = findBooking
    ? COLUMNS.map((col) =>
        col.title === "Play"
          ? { ...col, links: [...col.links, { href: "/booking", label: "Find my booking" }] }
          : col,
      )
    : COLUMNS;
  return (
    <footer className="border-border border-t">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="text-body text-muted-foreground max-w-[32ch]">{FOOTER_LINE}</p>
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title} className="flex flex-col gap-3">
            <h2 className="text-label">{col.title}</h2>
            <ul className="flex flex-col gap-2">
              {col.links.map((link) => (
                <li key={link.label}>
                  {/* Off site links (Messenger, a text) are plain anchors: `Link`
                      is for this app's own routes, and reads a bracketed
                      placeholder in a URL as a dynamic route and throws. */}
                  {link.href.startsWith("/") || link.href.startsWith("#") ? (
                    <SectionLink href={link.href} className={LINK}>
                      {link.label}
                    </SectionLink>
                  ) : (
                    <a href={link.href} className={LINK}>
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-border border-t">
        <p className="text-caption text-muted-foreground mx-auto w-full max-w-6xl px-4 py-6">
          © {new Date().getFullYear()} {VENUE_NAME}. {VENUE_ADDRESS}.
        </p>
      </div>
    </footer>
  );
}
