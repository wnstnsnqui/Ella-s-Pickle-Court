import { CELL_VIEW_ICON, CELL_VIEW_NAME, PUBLIC_LEGEND_VIEWS, type CellView } from "./cell-view";
import { cn } from "@/lib/utils";

const swatch: Record<CellView, string> = {
  available: "bg-state-available text-state-available-fg border-state-available-border",
  booked: "bg-state-booked text-state-booked-fg border-state-booked-border",
  unavailable: "bg-state-unavailable text-state-unavailable-fg border-state-unavailable-border",
  "out-of-hours": "bg-state-outofhours text-state-outofhours-fg border-state-outofhours-border",
  selected: "bg-state-selected text-state-selected-fg border-state-selected-border",
  saving: "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive text-destructive-foreground border-destructive",
};

/**
 * What the icons mean. Spec 0003, AC-6.
 *
 * Always on the page, never behind a tap, and one compact row so it does not eat
 * the hours the grid is there to show. It is a server component because it says
 * the same thing to everybody, forever.
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
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}
    >
      {views.map((view) => {
        const Icon = CELL_VIEW_ICON[view];
        return (
          <li key={view} className="text-caption flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn("rounded-cell grid size-5 place-items-center border", swatch[view])}
            >
              <Icon className="size-3" />
            </span>
            <span className="text-muted-foreground">{CELL_VIEW_NAME[view]}</span>
          </li>
        );
      })}
    </ul>
  );
}
