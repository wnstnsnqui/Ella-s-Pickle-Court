import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BoardNotice } from "@/components/board-notice";
import { DayChart } from "@/components/reports/day-chart";
import { DaySection } from "@/components/reports/day-section";
import { Heatmap } from "@/components/reports/heatmap";
import { HourChart } from "@/components/reports/hour-chart";
import { ReportError } from "@/components/reports/report-error";
import { ReportsShell } from "@/components/reports/reports-shell";
import { ReportTiles } from "@/components/reports/report-tiles";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { byDay, byHour, byWeekdayHour, datesInRange, hourAxis, totals } from "@/lib/report/buckets";
import { getDayReservations, getUsageReport } from "@/lib/report/queries";
import { reportQuerySchema } from "@/lib/report/schemas";
import { isOwnerLevel } from "@/lib/schedule/constants";
import { currentStaff } from "@/lib/staff";
import { daysBetween } from "@/lib/time";
import { VENUE_NAME } from "@/lib/venue";

/**
 * The owner's usage report. Spec 0008, AC-1 and AC-2.
 *
 * `proxy.ts` has already sent a signed out visitor to `/sign-in`. Of the
 * signed in, only an active owner, admin or superadmin stays (spec 0012,
 * AC-12): anybody else is sent to `/staff` before the report read happens,
 * exactly as `/staff/settings` does. That redirect is a courtesy;
 * `court_usage` raising for anyone else is what actually enforces AC-4.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reports",
  description: `Court usage for ${VENUE_NAME}.`,
  robots: { index: false, follow: false },
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const current = await currentStaff();

  if (current.kind === "signed_out") redirect("/sign-in");

  if (current.kind === "error") {
    return (
      <BoardNotice heading="Reports" icon={CircleAlert} title="Could not load your account">
        The venue database did not answer in time. Reload in a moment, and if it keeps happening
        tell Ella.
      </BoardNotice>
    );
  }

  if (!current.staff.isActive || !isOwnerLevel(current.staff.role)) redirect("/staff");

  const raw = await searchParams;
  const first = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : undefined;
  const query = reportQuerySchema.parse({
    range: first(raw.range),
    court: first(raw.court),
    day: first(raw.day),
  });

  const result = await getUsageReport({ range: query.range, courtId: query.court });

  if (!result.ok) {
    return (
      <ReportsShell>
        <ReportError message={result.error.message} />
      </ReportsShell>
    );
  }

  const { from, to, rows, courts, hours } = result.data;
  const dates = datesInRange(from, to);
  const liveCourtCount = courts.filter((court) => !court.retiredAt).length;
  const courtsCount = query.court ? 1 : Math.max(1, liveCourtCount);

  const hourBuckets = byHour(rows, dates, hours, courtsCount);
  const dayBuckets = byDay(rows, dates, hours, courtsCount);
  const weekdayHourCells = byWeekdayHour(rows, dates, hours, courtsCount);
  const reportTotals = totals(rows, dates, hours, courtsCount);
  const axisHours = hourAxis(hours, rows);

  const dayInRange =
    query.day !== undefined && daysBetween(from, query.day) >= 0 && daysBetween(query.day, to) >= 0;

  const dayResult = dayInRange ? await getDayReservations(query.day!) : null;

  const closeHref = (() => {
    const params = new URLSearchParams({ range: query.range });
    if (query.court) params.set("court", String(query.court));
    return `/staff/reports?${params.toString()}`;
  })();

  return (
    <ReportsShell>
      <ReportToolbar range={query.range} courtId={query.court} courts={courts} />

      {rows.length === 0 ? (
        <p role="status" className="text-body text-muted-foreground">
          No bookings in this range.
        </p>
      ) : null}

      <ReportTiles totals={reportTotals} />

      <p className="text-caption text-muted-foreground">
        Utilisation uses the venue&apos;s current opening hours for each day of the week, and its
        live courts, not the hours in force on each day shown. A day marked closed today therefore
        reads as closed for the whole range.
      </p>

      <div className="flex flex-col gap-4">
        <HourChart buckets={hourBuckets} hours={axisHours} />
        <DayChart buckets={dayBuckets} />
        <Heatmap cells={weekdayHourCells} hours={axisHours} />
      </div>

      {dayInRange ? (
        dayResult && dayResult.ok ? (
          <DaySection day={query.day!} reservations={dayResult.data} closeHref={closeHref} />
        ) : dayResult ? (
          <ReportError message={dayResult.error.message} />
        ) : null
      ) : null}
    </ReportsShell>
  );
}
