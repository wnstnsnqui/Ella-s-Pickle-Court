"use client";

import { ArchiveRestore, ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import type { OwnerCourt } from "@/lib/schedule/queries";
import { formatAtVenue } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * The courts that are out of use, folded away. Spec 0007, AC-7.
 *
 * A real disclosure: one button with `aria-expanded` and the list it controls.
 * Restore is one tap, no confirmation, because bringing a court back is a
 * change every board shows at once and nothing is lost by it.
 */
export function RetiredCourts({
  courts,
  pendingId,
  onRestore,
}: {
  courts: readonly OwnerCourt[];
  /** The court whose restore is in flight, if any. */
  pendingId: number | null;
  onRestore: (court: OwnerCourt) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <section
      aria-labelledby={`${listId}-heading`}
      className="border-border bg-card rounded-lg border"
    >
      <h2 id={`${listId}-heading`} className="text-title">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className="focus-visible:ring-ring/50 flex w-full items-center justify-between gap-3 rounded-lg p-4 text-left outline-none focus-visible:ring-[3px] sm:px-6"
        >
          <span className="flex flex-col gap-0.5">
            <span>
              Retired courts{" "}
              <span className="text-muted-foreground tabular-nums">({courts.length})</span>
            </span>
            <span className="text-caption text-muted-foreground font-normal">
              Out of use, kept with their history. Restore one to put it back on the boards.
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "text-muted-foreground size-5 shrink-0 transition-transform duration-(--dur-fast) motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
      </h2>
      <ul id={listId} hidden={!open} className="divide-border divide-y border-t px-4 sm:px-6">
        {courts.map((court) => (
          <li key={court.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-label truncate">{court.name}</p>
              <p className="text-caption text-muted-foreground">
                Retired{" "}
                {court.retiredAt ? (
                  <time dateTime={court.retiredAt}>
                    {formatAtVenue(court.retiredAt, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </time>
                ) : null}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pendingId !== null}
              onClick={() => onRestore(court)}
            >
              <ArchiveRestore aria-hidden="true" />
              {pendingId === court.id ? "Restoring" : "Restore"}
              <span className="sr-only"> {court.name}</span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
