import type { ReportTotals } from "@/lib/report/buckets";
import { formatSlotLabel } from "@/lib/time";

const WEEKDAY_LABEL: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  0: "Sunday",
};

/** The four summary tiles. Spec 0008, AC-6. */
export function ReportTiles({ totals }: { totals: ReportTotals }) {
  const bookedHours = (totals.bookedMinutes / 60).toFixed(1);
  const busiestHour =
    totals.busiestHour === null
      ? "—"
      : formatSlotLabel(`${String(totals.busiestHour).padStart(2, "0")}:00`);
  const busiestWeekday =
    totals.busiestWeekday === null ? "—" : WEEKDAY_LABEL[totals.busiestWeekday];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="Booked hours" value={bookedHours} />
      <Tile label="Utilisation" value={`${totals.utilisationPercent}%`} />
      <Tile label="Busiest hour" value={busiestHour} />
      <Tile label="Busiest weekday" value={busiestWeekday} />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="text-title mt-1 tabular-nums">{value}</p>
    </div>
  );
}
