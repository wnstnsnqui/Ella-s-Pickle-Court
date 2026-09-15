import { SettingsShell } from "@/components/settings/settings-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** The three sections' shape while the read streams. Spec 0007, AC-2. */
export default function Loading() {
  return (
    <SettingsShell>
      <p role="status" className="sr-only">
        Loading the settings
      </p>
      <SectionSkeleton rows={3} />
      <SectionSkeleton rows={2} tall />
      <SectionSkeleton rows={1} />
    </SettingsShell>
  );
}

function SectionSkeleton({ rows, tall = false }: { rows: number; tall?: boolean }) {
  return (
    <div aria-hidden="true" className="border-border bg-card rounded-lg border p-4 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <Skeleton className="size-8 rounded-md" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-56" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className={tall ? "h-16 w-full" : "h-10 w-full"} />
        ))}
      </div>
    </div>
  );
}
