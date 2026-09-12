import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The grid's shape while a different day is on its way. Spec 0003, AC-13.
 *
 * It mirrors the real grid's geometry exactly, from the same tokens, so the page
 * does not jump when the real rows arrive.
 */
export function GridSkeleton({
  rows = 8,
  courts = 3,
  className,
}: {
  rows?: number;
  courts?: number;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden", className)} aria-hidden="true">
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `var(--col-time) repeat(${courts}, minmax(var(--col-court-min), 1fr))`,
        }}
      >
        <Skeleton className="rounded-cell h-8" />
        {Array.from({ length: courts }, (_, court) => (
          <Skeleton key={`head-${court}`} className="rounded-cell h-8" />
        ))}
        {Array.from({ length: rows }, (_, row) => (
          <Fragmented key={row} courts={courts} />
        ))}
      </div>
    </div>
  );
}

function Fragmented({ courts }: { courts: number }) {
  return (
    <>
      <Skeleton className="h-row rounded-cell" />
      {Array.from({ length: courts }, (_, court) => (
        <Skeleton key={court} className="h-row rounded-cell" />
      ))}
    </>
  );
}
