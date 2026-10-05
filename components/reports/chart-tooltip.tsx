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
    <div className="bg-popover text-popover-foreground ring-border text-caption rounded-2xl px-3 py-2 shadow-sm ring-1">
      <p className="font-medium">{point.label}</p>
      <p>
        {point.bookedHours.toFixed(1)}h booked · {point.utilisationPercent}% utilisation
      </p>
    </div>
  );
}
