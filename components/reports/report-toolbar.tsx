import { Download } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  REPORT_RANGE_LABELS,
  REPORT_RANGE_PRESETS,
  type ReportRangePreset,
} from "@/lib/report/range";
import type { ReportCourt } from "@/lib/report/queries";
import { cn } from "@/lib/utils";

import { CourtSelect } from "./court-select";

function chipHref(preset: ReportRangePreset, courtId: number | undefined): string {
  const params = new URLSearchParams({ range: preset });
  if (courtId) params.set("court", String(courtId));
  return `/staff/reports?${params.toString()}`;
}

function csvHref(range: ReportRangePreset, courtId: number | undefined): string {
  const params = new URLSearchParams({ range });
  if (courtId) params.set("court", String(courtId));
  return `/staff/reports/usage.csv?${params.toString()}`;
}

/** The preset chips, the court picker and the CSV download. Spec 0008, AC-6. */
export function ReportToolbar({
  range,
  courtId,
  courts,
}: {
  range: ReportRangePreset;
  courtId: number | undefined;
  courts: readonly ReportCourt[];
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav aria-label="Report range" className="flex flex-wrap gap-1.5">
        {REPORT_RANGE_PRESETS.map((preset) => {
          const active = preset === range;
          return (
            <Link
              key={preset}
              href={chipHref(preset, courtId)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "text-label rounded-full border px-3 py-1.5 transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-card hover:bg-accent",
              )}
            >
              {REPORT_RANGE_LABELS[preset]}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-2">
        <CourtSelect courts={courts} selectedCourtId={courtId} />
        <Button asChild variant="outline" size="sm">
          <Link href={csvHref(range, courtId)}>
            <Download aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Download CSV</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
