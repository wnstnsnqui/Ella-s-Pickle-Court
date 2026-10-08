import { ArrowRightIcon, BroadcastIcon } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { formatSlotLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatPeso } from "@/lib/venue";

import { HERO } from "./content";
import { HeroBoard } from "./hero-board";
import type { HeroBoardData } from "./hero-data";
import { PRESS } from "./press";
import { SectionLink } from "./section-link";

/** One step of the hero's arrival cascade (`[data-rise]` in `app/globals.css`). */
export function rise(i: number) {
  return { "data-rise": "", style: { "--i": i } as React.CSSProperties };
}

export type HeroStats = {
  /** How many courts the schedule has, or null when the read is unavailable. */
  courts: number | null;
  /** The week's earliest opening, `HH:mm`, or null when unavailable or every day is closed. */
  earliestOpen: string | null;
  /** Pesos per court hour, `hourly_rate` from the read, or null when unavailable (spec 0015, AC-17). */
  hourlyRate: number | null;
};

/**
 * The first screen: the promise, the way in, and a glimpse of the live
 * board that proves it. A yellow panel inset from the page edge, drawn with a
 * faint court outline rather than a photograph, because the system ships no
 * images.
 *
 * Spec 0013, AC-15 and AC-16: the board and the three data stats (the price
 * from `hourly_rate`, spec 0015, AC-17) come from the real read, and each is simply left out when that read is unavailable, so the
 * hero never shows a number the schedule could contradict.
 */
export function Hero({ board, stats }: { board: HeroBoardData | null; stats: HeroStats }) {
  const items = [
    stats.courts === null ? null : { value: String(stats.courts), label: "Courts" },
    stats.earliestOpen === null
      ? null
      : { value: formatSlotLabel(stats.earliestOpen), label: "Earliest serve" },
    stats.hourlyRate === null
      ? null
      : { value: formatPeso(stats.hourlyRate), label: "Per court hour" },
  ].filter((item) => item !== null);

  return (
    <section aria-labelledby="hero-title" className="px-3 pt-2 md:px-4">
      <div
        className={cn(
          "bg-brand text-brand-foreground relative mx-auto grid w-full max-w-[70rem] items-center gap-12 overflow-hidden rounded-[2rem] px-6 py-14 md:px-12 md:py-20",
          board && "lg:grid-cols-[1.1fr_1fr]",
        )}
      >
        <CourtLines />

        <div className="relative flex flex-col items-start gap-6">
          <p
            {...rise(0)}
            className="text-label bg-mark/90 text-mark-foreground inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-2"
          >
            <BroadcastIcon aria-hidden="true" weight="bold" className="size-4" />
            {HERO.eyebrow}
          </p>
          <h1 id="hero-title" {...rise(1)} className="text-hero max-w-[12ch] text-balance">
            {HERO.title}
          </h1>
          <p {...rise(2)} className="text-body max-w-[46ch] text-pretty opacity-80">
            {HERO.lede}
          </p>
          <div {...rise(3)} className="flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className={cn("bg-mark text-mark-foreground hover:bg-mark/90 h-12 px-6", PRESS)}
            >
              <SectionLink href="#book">
                Book a court
                <ArrowRightIcon aria-hidden="true" weight="bold" data-icon="inline-end" />
              </SectionLink>
            </Button>
          </div>
          <dl {...rise(4)} className="mt-4 flex flex-wrap gap-x-10 gap-y-6">
            {items.map((stat) => (
              <div key={stat.label} className="flex flex-col-reverse gap-1">
                <dt className="text-caption opacity-70">{stat.label}</dt>
                <dd className="text-display tabular-nums">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {board ? (
          <div {...rise(3)} className="relative">
            <HeroBoard board={board} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** A pickleball court's outline, faint, as the panel's texture. */
function CourtLines() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 440 200"
      fill="none"
      className="pointer-events-none absolute -right-24 -bottom-16 w-[56rem] max-w-none rotate-[-8deg] stroke-current opacity-[0.07]"
    >
      <rect x="2" y="2" width="436" height="196" rx="4" strokeWidth="3" />
      <line x1="220" y1="2" x2="220" y2="198" strokeWidth="5" />
      <line x1="154" y1="2" x2="154" y2="198" strokeWidth="3" />
      <line x1="286" y1="2" x2="286" y2="198" strokeWidth="3" />
      <line x1="2" y1="100" x2="154" y2="100" strokeWidth="3" />
      <line x1="286" y1="100" x2="438" y2="100" strokeWidth="3" />
    </svg>
  );
}
