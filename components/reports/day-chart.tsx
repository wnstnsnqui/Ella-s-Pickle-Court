"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { formatDayHeading } from "@/lib/time";
import type { DayBucket } from "@/lib/report/buckets";

import { ChartTooltip } from "./chart-tooltip";
import { HiddenDataTable } from "./hidden-data-table";

/** Booked hours by day. Clicking a bar opens that day's list. Spec 0008, AC-6 and AC-8. */
export function DayChart({ buckets }: { buckets: readonly DayBucket[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function dayHref(date: string): string {
    const params = new URLSearchParams(searchParams);
    params.set("day", date);
    return `${pathname}?${params.toString()}`;
  }

  const data = buckets.map((bucket) => ({
    date: bucket.date,
    label: formatDayHeading(bucket.date).replace(/ \D+$/, ""),
    bookedHours: Math.round((bucket.bookedMinutes / 60) * 10) / 10,
    utilisationPercent: bucket.utilisationPercent,
  }));

  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <h2 className="text-title mb-3">Booked hours by day</h2>
      <div aria-hidden="true">
        <BarChart data={data} width="100%" height={260} responsive accessibilityLayer={false}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            stroke="var(--color-muted-foreground)"
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="var(--color-muted-foreground)"
            allowDecimals={false}
          />
          <Tooltip content={<ChartTooltip />} />
          <Bar
            dataKey="bookedHours"
            fill="var(--color-primary)"
            radius={[4, 4, 0, 0]}
            className="cursor-pointer"
            onClick={(point: { payload?: { date: string } }) => {
              const date = point?.payload?.date;
              if (date) router.push(dayHref(date));
            }}
          />
        </BarChart>
      </div>
      <HiddenDataTable
        caption="Booked hours by day"
        headers={["Date", "Booked hours", "Utilisation"]}
        rows={data.map((row) => [
          <Link key={row.date} href={dayHref(row.date)}>
            {formatDayHeading(row.date)}
          </Link>,
          row.bookedHours.toFixed(1),
          `${row.utilisationPercent}%`,
        ])}
      />
    </div>
  );
}
