import type { ReportTotals } from "@/lib/report/buckets";
import { formatDayHeading, formatSlotLabel } from "@/lib/time";

/** The four summary tiles. Spec 0008, AC-6. */
export function ReportTiles({ totals }: { totals: ReportTotals }) {
  const bookedHours = (totals.bookedMinutes / 60).toFixed(1);
  const busiestHour =
    totals.busiestHour === null
      ? "—"
      : formatSlotLabel(`${String(totals.busiestHour).padStart(2, "0")}:00`);
  const peakDay = totals.busiestDate === null ? "—" : formatDayHeading(totals.busiestDate);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="Booked hours" value={bookedHours} />
      <Tile label="Utilisation" value={`${totals.utilisationPercent}%`} />
      <Tile label="Busiest hour" value={busiestHour} />
      <Tile label="Peak day" value={peakDay} />
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
