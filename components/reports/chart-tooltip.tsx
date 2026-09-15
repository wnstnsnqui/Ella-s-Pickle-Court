type ChartPoint = { label: string; bookedHours: number; utilisationPercent: number };

/** Booked hours and utilisation together, spec 0008 AC-6. */
export function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload: ChartPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="border-border bg-popover text-popover-foreground rounded-md border px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium">{point.label}</p>
      <p>
        {point.bookedHours.toFixed(1)}h booked · {point.utilisationPercent}% utilisation
      </p>
    </div>
  );
}
