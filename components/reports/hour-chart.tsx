"use client";

import { ClockIcon } from "@phosphor-icons/react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { formatSlotLabel } from "@/lib/time";
import type { HourBucket } from "@/lib/report/buckets";

import { ChartTooltip } from "./chart-tooltip";
import { SectionCard } from "@/components/section-card";

import { HiddenDataTable } from "./hidden-data-table";

/** Booked hours by hour of day. Spec 0008, AC-6 and AC-7. */
export function HourChart({
  buckets,
  hours,
}: {
  buckets: readonly HourBucket[];
  hours: readonly number[];
}) {
  const byHour = new Map(buckets.map((bucket) => [bucket.hour, bucket]));
  const data = hours.map((hour) => {
    const bucket = byHour.get(hour);
    return {
      hour,
      label: formatSlotLabel(`${String(hour).padStart(2, "0")}:00`),
      bookedHours: Math.round(((bucket?.bookedMinutes ?? 0) / 60) * 10) / 10,
      utilisationPercent: bucket?.utilisationPercent ?? 0,
    };
  });

  return (
    <SectionCard id="by-hour" icon={ClockIcon} title="Booked hours by hour of day">
      <div aria-hidden="true">
        <BarChart data={data} width="100%" height={260} responsive accessibilityLayer={false}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="var(--color-muted-foreground)"
            allowDecimals={false}
          />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="bookedHours" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </div>
      <HiddenDataTable
        caption="Booked hours by hour of day"
        headers={["Hour", "Booked hours", "Utilisation"]}
        rows={data.map((row) => [
          row.label,
          row.bookedHours.toFixed(1),
          `${row.utilisationPercent}%`,
        ])}
      />
    </SectionCard>
  );
}
