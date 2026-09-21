import { AccountShell } from "@/components/auth/account-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** The sections' shape while the session and staff row are read. Spec 0004 (revised), AC-9. */
export default function Loading() {
  return (
    <AccountShell>
      <p role="status" className="sr-only">
        Loading your account
      </p>
      <SectionSkeleton rows={4} />
      <SectionSkeleton rows={3} />
      <SectionSkeleton rows={1} />
    </AccountShell>
  );
}

function SectionSkeleton({ rows }: { rows: number }) {
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
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
