import { CircleCheck, CircleSlash, Clock } from "lucide-react";

import { nextFreeTime, type Grid } from "@/lib/schedule/grid";
import { formatSlotLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * The answer before the grid. Spec 0006, AC-3.
 *
 * One compact line per court, in sort order: "Free now", "Free from 3pm", or
 * "Nothing free today". Shown only when the day is venue today, because "now"
 * means nothing on any other day. Every line is text with an icon, so the
 * strip reads the same in glare, in greyscale and to a screen reader; colour
 * is never the only signal.
 */
export function NextFreeStrip({
  grid,
  now,
  className,
}: {
  grid: Grid;
  /** The board's clock, a UTC instant in ms. */
  now: number;
  className?: string;
}) {
  const at = new Date(now);
  return (
    <ul
      aria-label="Next free slot on each court"
      className={cn("flex gap-2 overflow-x-auto pb-1", className)}
    >
      {grid.courts.map((court) => {
        const row = nextFreeTime(grid, court.id, at);
        const reading =
          row === null
            ? { icon: CircleSlash, text: "Nothing free today", tone: "text-muted-foreground" }
            : Date.parse(row.startsAt) <= now
              ? { icon: CircleCheck, text: "Free now", tone: "text-state-available-fg" }
              : { icon: Clock, text: `Free from ${formatSlotLabel(row.label)}`, tone: "" };
        const Icon = reading.icon;
        return (
          <li
            key={court.id}
            className="border-border bg-card flex min-w-max shrink-0 items-center gap-2 rounded-lg border px-3 py-2"
          >
            <span className="text-label">{court.name}</span>
            <span className={cn("text-caption flex items-center gap-1 tabular-nums", reading.tone)}>
              <Icon aria-hidden="true" className="size-4" />
              {reading.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
