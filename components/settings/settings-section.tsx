import { cn } from "@/lib/utils";

/**
 * One card on the settings page: an icon, a heading, a line that says what the
 * section changes, an optional action on the right, and the body. Spec 0007,
 * AC-2. The heading carries the section's `id`, so the page can be linked
 * straight to Opening hours.
 */
export function SettingsSection({
  id,
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
}: {
  id: string;
  /** A Lucide icon, or anything else that takes the size class. */
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className={cn("border-border bg-card rounded-lg border p-4 sm:p-6", className)}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="bg-secondary text-secondary-foreground mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md"
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id={`${id}-heading`} className="text-title">
              {title}
            </h2>
            <p className="text-caption text-muted-foreground">{description}</p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
