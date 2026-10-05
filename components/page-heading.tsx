import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * How a working page opens (spec 0018, AC-12): the landing's eyebrow, title
 * and lede, at working size (`text-display`, not the landing's fluid
 * headline), with the way back to the board above it as a round pill.
 * It never reveals on scroll: a staff page is read, not toured.
 */
export function PageHeading({
  eyebrow,
  title,
  lede,
  back = true,
  as: Heading = "h1",
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  /** The "Back to the board" pill above the heading. */
  back?: boolean;
  /** The page's one `h1`, unless it is shown as a sample inside another page. */
  as?: "h1" | "h3";
}) {
  return (
    <div className="flex flex-col gap-3">
      {back ? (
        <Button
          asChild
          variant="ghost"
          className="press text-label -ml-3 h-10 w-fit rounded-full px-3"
        >
          <Link href="/staff">
            <ArrowLeftIcon aria-hidden="true" weight="bold" />
            Back to the board
          </Link>
        </Button>
      ) : null}
      <div className="flex max-w-2xl flex-col gap-2">
        <p className="text-label text-link tracking-wide uppercase">{eyebrow}</p>
        <Heading className="text-display text-balance">{title}</Heading>
        {lede ? (
          <p className="text-body text-muted-foreground max-w-[56ch] text-pretty">{lede}</p>
        ) : null}
      </div>
    </div>
  );
}
