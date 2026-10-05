import { GridSkeleton } from "@/components/schedule/grid-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * A board page's gutter (spec 0018, AC-15): 8px at the sides and above the
 * card on a phone, so seven rows fit a small screen, and from 1024px the card
 * starts 96px down, level with the summary card's sticky top.
 */
export const BOARD_PAGE = "px-2 pt-2 pb-6 sm:px-4 sm:pt-4 lg:pt-8";

/**
 * The white card a board sits in, as the landing's booking card (spec 0018,
 * AC-5): the day header on top, then the legend and the grid, or whichever
 * loading, error, empty or closed state stands in for them. Tighter on a phone
 * so seven rows still fit a small screen (AC-15).
 *
 * No hooks and no server only import, so a server page and a client board
 * can both render it.
 */
export function BoardCard({
  header,
  children,
  className,
}: {
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "surface-card flex min-w-0 flex-col gap-2 p-3 sm:gap-3 sm:p-4 lg:p-6",
        className,
      )}
    >
      {header}
      {children}
    </div>
  );
}

/**
 * A day the venue is closed, said as the landing says it: a quiet, centred
 * line on the muted fill (spec 0018, AC-5), with any action staff have on it.
 */
export function ClosedDayPanel({ action }: { action?: React.ReactNode }) {
  return (
    <div className="bg-muted text-body text-muted-foreground flex flex-col items-center gap-3 rounded-2xl px-4 py-6 text-center">
      <p>
        <span className="text-foreground font-medium">Closed all day.</span> The venue is not open
        on this day.
      </p>
      {action}
    </div>
  );
}

/**
 * A board page's shape while the server answers: the card with its heading,
 * strip and legend footprints and the grid's own skeleton, and on staff the
 * summary card's place beside it, so nothing jumps when the board arrives.
 */
export function BoardPageSkeleton({ summary = false }: { summary?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn("grid items-start gap-4", summary && "lg:grid-cols-[minmax(0,1fr)_20rem]")}
    >
      <BoardCard
        header={
          <>
            <Skeleton className="h-7 w-44" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-16 flex-1 rounded-2xl" />
              <Skeleton className="size-11 rounded-full" />
            </div>
          </>
        }
      >
        <Skeleton className="h-4 w-64" />
        <GridSkeleton />
      </BoardCard>
      {summary ? <Skeleton className="hidden h-40 rounded-3xl lg:block" /> : null}
    </div>
  );
}
