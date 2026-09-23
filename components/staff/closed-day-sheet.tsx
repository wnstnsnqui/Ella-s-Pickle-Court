"use client";

import { useState } from "react";

import { BoardSheet } from "@/components/board-sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Grid } from "@/lib/schedule/grid";
import { formatSlotLabel, localEndTimeInZone } from "@/lib/time";

/**
 * A booking on a day the venue is shut. Spec 0007, AC-19.
 *
 * Closed is a statement about the schedule, not a lock on the till: a
 * tournament or a private hire should not need Ella and a database editor.
 * There is no cell to tap on a closed day, so the court, the start and the end
 * are named here, and what comes back is an ordinary range the usual booking
 * sheet and write path take from there.
 */
export function ClosedDaySheet({
  open,
  onOpenChange,
  grid,
  onContinue,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grid: Grid;
  onContinue: (range: { courtId: number; startsAt: string; endsAt: string }) => void;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}) {
  const rows = grid.rows;
  // Nothing picked yet reads as the first court and the first hour of the day,
  // so the common case is two taps rather than five. Derived rather than seeded
  // in an effect, which would cascade a render every time the sheet opened.
  const [picked, setPicked] = useState<{ court?: string; start?: string; end?: string }>({});
  const courtId = picked.court ?? (grid.courts[0] ? String(grid.courts[0].id) : "");
  const startsAt = picked.start ?? rows[0]?.startsAt ?? "";
  const endsAt = picked.end ?? rows[0]?.endsAt ?? "";

  const startIndex = rows.findIndex((row) => row.startsAt === startsAt);
  const ends = startIndex === -1 ? [] : rows.slice(startIndex);
  const ready = courtId !== "" && startsAt !== "" && endsAt !== "";

  return (
    <BoardSheet
      open={open}
      onOpenChange={(next) => {
        // A closed sheet forgets what was picked, so the next one opens fresh.
        if (!next) setPicked({});
        onOpenChange(next);
      }}
      returnFocusTo={returnFocusTo}
      title="Add booking"
      description="The venue is closed this day. Name the court and the hours, then take the booking as usual."
      footer={
        <Button
          type="button"
          disabled={!ready}
          className="w-full"
          onClick={() => {
            if (!ready) return;
            setPicked({});
            onContinue({ courtId: Number(courtId), startsAt, endsAt });
          }}
        >
          Continue
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="closed-court">Court</Label>
          <Select
            value={courtId}
            onValueChange={(value) => setPicked((current) => ({ ...current, court: value }))}
          >
            <SelectTrigger id="closed-court" className="w-full">
              <SelectValue placeholder="Pick a court" />
            </SelectTrigger>
            <SelectContent>
              {grid.courts.map((court) => (
                <SelectItem key={court.id} value={String(court.id)}>
                  {court.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="closed-start">Starts</Label>
            <Select
              value={startsAt}
              onValueChange={(value) => {
                // A new start takes its own slot's end, so the pair is never
                // back to front while the person is still picking.
                const index = rows.findIndex((row) => row.startsAt === value);
                setPicked((current) => ({
                  ...current,
                  start: value,
                  end: rows[index]?.endsAt ?? "",
                }));
              }}
            >
              <SelectTrigger id="closed-start" className="w-full tabular-nums">
                <SelectValue placeholder="Pick a time" />
              </SelectTrigger>
              <SelectContent>
                {rows.map((row) => (
                  <SelectItem key={row.startsAt} value={row.startsAt} className="tabular-nums">
                    {formatSlotLabel(row.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="closed-end">Ends</Label>
            <Select
              value={endsAt}
              onValueChange={(value) => setPicked((current) => ({ ...current, end: value }))}
            >
              <SelectTrigger id="closed-end" className="w-full tabular-nums">
                <SelectValue placeholder="Pick a time" />
              </SelectTrigger>
              <SelectContent>
                {ends.map((row) => (
                  <SelectItem key={row.endsAt} value={row.endsAt} className="tabular-nums">
                    {formatSlotLabel(localEndTimeInZone(row.endsAt, grid.timezone))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </BoardSheet>
  );
}
