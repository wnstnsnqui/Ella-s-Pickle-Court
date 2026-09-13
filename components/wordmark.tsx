import Link from "next/link";

import { VENUE_INITIAL, VENUE_NAME } from "@/lib/venue";
import { cn } from "@/lib/utils";

/**
 * The venue's mark, set in type. Spec 0003, AC-16: the system ships no image
 * assets, so the brand is a letter in Inter on the mark colour, which stays crisp
 * at any size and costs no request.
 */
export function Wordmark({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className="focus-visible:outline-ring rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <span className={cn("flex items-center gap-2", className)}>
        <span
          aria-hidden="true"
          className="bg-mark text-mark-foreground text-label grid size-7 shrink-0 place-items-center rounded-md font-semibold"
        >
          {VENUE_INITIAL}
        </span>
        <span className="text-title leading-none tracking-tight">{VENUE_NAME}</span>
      </span>
    </Link>
  );
}
