import { UsersShell } from "@/components/staff/users-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** The table's shape while the read streams. Spec 0012, AC-2. */
export default function Loading() {
  return (
    <UsersShell>
      <p role="status" className="sr-only">
        Loading the staff accounts
      </p>
      <div aria-hidden="true" className="border-border bg-card rounded-lg border p-4 sm:p-6">
        <ol className="divide-border divide-y">
          {Array.from({ length: 5 }, (_, index) => (
            <li key={index} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-9 w-28 shrink-0" />
              <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
            </li>
          ))}
        </ol>
      </div>
    </UsersShell>
  );
}
