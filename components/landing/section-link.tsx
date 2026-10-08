"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";

/**
 * The id a click on `href` should scroll to by hand, or null to leave it to
 * `Link`. Next scrolls a fragment only when the hash changes, so a second click
 * on `/#book` while the address already ends in `#book` does nothing. Only that
 * case is ours: same page, same query, same non empty hash.
 */
export function sameHashTarget(
  href: string,
  here: Pick<Location, "href" | "pathname" | "search" | "hash">,
): string | null {
  const to = new URL(href, here.href);
  if (to.hash === "" || to.hash !== here.hash) return null;
  if (to.pathname !== here.pathname || to.search !== here.search) return null;
  return decodeURIComponent(to.hash.slice(1));
}

/**
 * A `Link` to a section of the landing page that scrolls there on every click,
 * not just the first. A plain click is all it takes over; a modified one (new
 * tab, new window) goes to `Link` untouched.
 */
export function SectionLink({
  href,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { href: string }) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const id = sameHashTarget(href, window.location);
    const target = id === null ? null : document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    // `scroll-behavior` in globals.css decides smooth or instant, and the
    // section's `scroll-mt-*` keeps it clear of the sticky header.
    target.scrollIntoView();
  }
  return <Link href={href} onClick={handleClick} {...props} />;
}
