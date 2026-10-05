"use client";

import {
  ArchiveIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CourtBasketballIcon,
  PencilSimpleIcon,
  PlusIcon,
} from "@phosphor-icons/react";

import { EmptyState } from "@/components/schedule/empty-state";
import { Button } from "@/components/ui/button";
import type { OwnerCourt } from "@/lib/schedule/queries";

import { SectionCard } from "@/components/section-card";

/**
 * The live courts, in the order the boards show them. Spec 0007, AC-3 and AC-5.
 *
 * Each row is one court with its four controls. The arrows are icon buttons
 * with the court's name in their accessible name, so "Move Court 2 up" is what
 * a screen reader says. While a reorder is in flight every arrow is locked,
 * because a second press on an already moving list has nothing honest to say.
 */
export function CourtList({
  courts,
  locked,
  onAdd,
  onEdit,
  onMove,
  onRetire,
}: {
  courts: readonly OwnerCourt[];
  /** A reorder is in flight: no arrow may be pressed. */
  locked: boolean;
  onAdd: (opener: HTMLElement) => void;
  onEdit: (court: OwnerCourt, opener: HTMLElement) => void;
  onMove: (court: OwnerCourt, direction: "up" | "down") => void;
  onRetire: (court: OwnerCourt, opener: HTMLElement) => void;
}) {
  return (
    <SectionCard
      id="courts"
      icon={CourtBasketballIcon}
      title="Courts"
      description="One column each, in this order, on both boards."
      action={
        <Button
          type="button"
          variant="outline"
          onClick={(event) => onAdd(event.currentTarget)}
          className="press h-10 rounded-full px-4"
        >
          <PlusIcon aria-hidden="true" />
          Add court
        </Button>
      }
    >
      {courts.length === 0 ? (
        <EmptyState
          icon={CourtBasketballIcon}
          title="No courts yet"
          body="Add the first one and it becomes the first column on both boards."
          action={
            <Button
              type="button"
              variant="ink"
              onClick={(event) => onAdd(event.currentTarget)}
              className="press h-12 px-5"
            >
              <PlusIcon aria-hidden="true" />
              Add court
            </Button>
          }
        />
      ) : (
        <ol className="divide-border divide-y">
          {courts.map((court, index) => (
            <li key={court.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
              <span
                aria-hidden="true"
                className="text-caption text-muted-foreground w-6 shrink-0 text-center tabular-nums"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-label truncate">{court.name}</p>
                {court.note ? (
                  <p className="text-caption text-muted-foreground truncate">{court.note}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="press rounded-full"
                  title="Move up"
                  disabled={locked || index === 0}
                  onClick={() => onMove(court, "up")}
                >
                  <ArrowUpIcon aria-hidden="true" />
                  <span className="sr-only">Move {court.name} up</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="press rounded-full"
                  title="Move down"
                  disabled={locked || index === courts.length - 1}
                  onClick={() => onMove(court, "down")}
                >
                  <ArrowDownIcon aria-hidden="true" />
                  <span className="sr-only">Move {court.name} down</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="press rounded-full"
                  onClick={(event) => onEdit(court, event.currentTarget)}
                >
                  <PencilSimpleIcon aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Edit</span>
                  <span className="sr-only"> {court.name}</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="press text-destructive rounded-full"
                  onClick={(event) => onRetire(court, event.currentTarget)}
                >
                  <ArchiveIcon aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Retire</span>
                  <span className="sr-only"> {court.name}</span>
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
