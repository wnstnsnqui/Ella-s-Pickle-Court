"use client";

import { Archive, ArrowDown, ArrowUp, LandPlot, Pencil, Plus } from "lucide-react";

import { EmptyState } from "@/components/schedule/empty-state";
import { Button } from "@/components/ui/button";
import type { OwnerCourt } from "@/lib/schedule/queries";

import { SettingsSection } from "./settings-section";

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
    <SettingsSection
      id="courts"
      icon={LandPlot}
      title="Courts"
      description="One column each, in this order, on both boards."
      action={
        <Button type="button" size="sm" onClick={(event) => onAdd(event.currentTarget)}>
          <Plus aria-hidden="true" />
          Add court
        </Button>
      }
    >
      {courts.length === 0 ? (
        <EmptyState
          icon={LandPlot}
          title="No courts yet"
          body="Add the first one and it becomes the first column on both boards."
          action={
            <Button type="button" onClick={(event) => onAdd(event.currentTarget)}>
              <Plus aria-hidden="true" />
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
                  title="Move up"
                  disabled={locked || index === 0}
                  onClick={() => onMove(court, "up")}
                >
                  <ArrowUp aria-hidden="true" />
                  <span className="sr-only">Move {court.name} up</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  title="Move down"
                  disabled={locked || index === courts.length - 1}
                  onClick={() => onMove(court, "down")}
                >
                  <ArrowDown aria-hidden="true" />
                  <span className="sr-only">Move {court.name} down</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(event) => onEdit(court, event.currentTarget)}
                >
                  <Pencil aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Edit</span>
                  <span className="sr-only"> {court.name}</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={(event) => onRetire(court, event.currentTarget)}
                >
                  <Archive aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Retire</span>
                  <span className="sr-only"> {court.name}</span>
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </SettingsSection>
  );
}
