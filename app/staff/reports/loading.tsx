import { ReportsShell } from "@/components/reports/reports-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** The toolbar, tiles and three chart areas while the read streams. Spec 0008, AC-10. */
export default function Loading() {
  return (
    <ReportsShell>
      <p role="status" className="sr-only">
        Loading the report
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-9 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-64 w-full" />
        ))}
      </div>
    </ReportsShell>
  );
}
