import { formatSlotLabel } from "@/lib/time";
import type { WeekdayHourCell } from "@/lib/report/buckets";
import { cn } from "@/lib/utils";

import { HiddenDataTable } from "./hidden-data-table";

/** Monday to Sunday, matching the Decision in spec 0008. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABEL: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  0: "Sun",
};

function shadeClass(ratio: number): string {
  if (ratio <= 0) return "bg-background";
  if (ratio <= 1 / 3) return "bg-primary/35";
  if (ratio <= 2 / 3) return "bg-primary/65";
  return "bg-primary";
}

/**
 * A weekday by hour grid, shaded by booked minutes relative to the largest
 * cell in view. Spec 0008, AC-6: a plain CSS grid rather than a Recharts
 * scatter (per the spec's Consequences, the drawing primitive is not pinned),
 * server rendered since a `title` attribute carries the hover tooltip and
 * nothing here needs a client hook.
 */
export function Heatmap({
  cells,
  hours,
}: {
  cells: readonly WeekdayHourCell[];
  hours: readonly number[];
}) {
  const byKey = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell]));
  const maxMinutes = Math.max(1, ...cells.map((cell) => cell.bookedMinutes));

  const gridItems: React.ReactNode[] = [<div key="corner" aria-hidden="true" />];
  for (const hour of hours) {
    gridItems.push(
      <div key={`hour-${hour}`} className="text-caption text-muted-foreground text-center">
        {hour}
      </div>,
    );
  }
  for (const weekday of WEEKDAY_ORDER) {
    gridItems.push(
      <div
        key={`weekday-${weekday}`}
        className="text-caption text-muted-foreground flex items-center"
      >
        {WEEKDAY_LABEL[weekday]}
      </div>,
    );
    for (const hour of hours) {
      const cell = byKey.get(`${weekday}-${hour}`);
      const bookedMinutes = cell?.bookedMinutes ?? 0;
      const bookedHours = (bookedMinutes / 60).toFixed(1);
      const utilisationPercent = cell?.utilisationPercent ?? 0;
      gridItems.push(
        <div
          key={`cell-${weekday}-${hour}`}
          className={cn("aspect-square rounded-sm", shadeClass(bookedMinutes / maxMinutes))}
          title={`${WEEKDAY_LABEL[weekday]} ${formatSlotLabel(`${String(hour).padStart(2, "0")}:00`)}: ${bookedHours}h booked, ${utilisationPercent}% utilisation`}
        />,
      );
    }
  }

  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <h2 className="text-title mb-3">Weekday by hour</h2>
      <div aria-hidden="true" className="overflow-x-auto">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `2.5rem repeat(${hours.length}, minmax(1.5rem, 1fr))` }}
        >
          {gridItems}
        </div>
      </div>
      <div className="text-caption text-muted-foreground mt-3 flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="bg-primary/35 size-3 rounded-sm" />
          Low
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-primary/65 size-3 rounded-sm" />
          Medium
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-primary size-3 rounded-sm" />
          High
        </span>
      </div>
      <HiddenDataTable
        caption="Weekday by hour, booked hours and utilisation"
        headers={["Weekday", "Hour", "Booked hours", "Utilisation"]}
        rows={WEEKDAY_ORDER.flatMap((weekday) =>
          hours.map((hour) => {
            const cell = byKey.get(`${weekday}-${hour}`);
            return [
              WEEKDAY_LABEL[weekday],
              formatSlotLabel(`${String(hour).padStart(2, "0")}:00`),
              ((cell?.bookedMinutes ?? 0) / 60).toFixed(1),
              `${cell?.utilisationPercent ?? 0}%`,
            ];
          }),
        )}
      />
    </div>
  );
}
