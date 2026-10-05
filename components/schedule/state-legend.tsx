import { CELL_VIEW_ICON, CELL_VIEW_NAME, PUBLIC_LEGEND_VIEWS, type CellView } from "./cell-view";
import { cn } from "@/lib/utils";

/**
 * What the icons mean. Spec 0003, AC-6, in the landing's look (spec 0018,
 * AC-7).
 *
 * Always on the page, never behind a tap: each view's bold icon beside its
 * word in muted caption type, the same icons the tiles carry, with no coloured
 * swatch. On a phone it is one row that scrolls sideways, so seven hours still
 * fit a small screen (AC-15); from 640px it wraps. A server component, because
 * it says the same thing to everybody, forever.
 */
export function StateLegend({
  views = PUBLIC_LEGEND_VIEWS,
  className,
}: {
  views?: readonly CellView[];
  className?: string;
}) {
  return (
    <ul
      aria-label="What the icons mean"
      className={cn(
        "text-caption text-muted-foreground flex [scrollbar-width:none] items-center gap-x-4 gap-y-1.5 overflow-x-auto sm:flex-wrap [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {views.map((view) => {
        const Icon = CELL_VIEW_ICON[view];
        return (
          <li key={view} className="flex shrink-0 items-center gap-1.5">
            <Icon aria-hidden="true" weight="bold" className="size-3.5 shrink-0" />
            {CELL_VIEW_NAME[view]}
          </li>
        );
      })}
    </ul>
  );
}
