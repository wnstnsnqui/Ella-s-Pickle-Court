import type { IconWeight } from "@phosphor-icons/react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * One section of a working page (spec 0018, AC-12, replacing spec 0007's
 * `SettingsSection`): a white `surface-card` whose header is a duotone icon in
 * the landing's icon chip, a title and a line that says what the section is
 * for, with its action on the right. Rows inside are divided by hairlines,
 * never boxed. The heading carries the section's `id`, so a page can be
 * linked straight to one section.
 *
 * No hooks and no server only import, so server pages and client forms share
 * it.
 */
export function SectionCard({
  id,
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
}: {
  id: string;
  /** A Phosphor icon; it is drawn duotone. */
  icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className={cn("surface-card flex min-w-0 flex-col gap-5 p-5 sm:p-6", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="chip-icon">
            <Icon weight="duotone" className="size-6" />
          </span>
          <div className="min-w-0">
            <h2 id={`${id}-heading`} className="text-title">
              {title}
            </h2>
            {description ? (
              <p className="text-caption text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** A section's shape while its page streams in: the icon chip, the heading, and rows. */
export function SectionCardSkeleton({ rows, tall = false }: { rows: number; tall?: boolean }) {
  return (
    <div aria-hidden="true" className="surface-card flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-2xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-56" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className={cn("w-full rounded-2xl", tall ? "h-16" : "h-10")} />
        ))}
      </div>
    </div>
  );
}
