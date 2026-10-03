"use client";

import { CheckCircleIcon, GlobeIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { OnlineChecksList } from "./online-checks-list";
import { useStaffBoard } from "./staff-schedule-context";

/**
 * The To check chip. Spec 0016, AC-1.
 *
 * On the toolbar for every active staff member, on every day shown. It counts
 * every booking waiting for its payment check, on any day, and adds the
 * refunds owed when there are any. With nothing waiting it stays, muted,
 * reading "All checked". The count is always a word as well as a number.
 * Pressing it opens the list.
 */
export function chipLabel(toCheck: number, refunds: number): string {
  if (toCheck === 0 && refunds === 0) return "All checked";
  const refundWord = refunds === 1 ? "refund" : "refunds";
  return `To check · ${toCheck}${refunds > 0 ? ` · ${refunds} ${refundWord}` : ""}`;
}

export function OnlineChecksChip() {
  const { checks, schedule } = useStaffBoard();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  const loaded = checks.load.state === "loaded" ? checks.load.checks : null;
  const toCheck = loaded?.toCheckCount ?? 0;
  const refunds = loaded?.refundCount ?? 0;
  const quiet = loaded !== null && toCheck === 0 && refunds === 0;

  return (
    <>
      <Button
        ref={opener}
        type="button"
        variant={quiet || !loaded ? "ghost" : toCheck > 0 ? "default" : "outline"}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn("h-11 shrink-0 tabular-nums", quiet && "text-muted-foreground")}
      >
        {quiet ? <CheckCircleIcon aria-hidden="true" /> : <GlobeIcon aria-hidden="true" />}
        {loaded ? chipLabel(toCheck, refunds) : "Online bookings"}
      </Button>
      <OnlineChecksList
        open={open}
        onOpenChange={setOpen}
        timeZone={schedule.grid.timezone}
        returnFocusTo={opener}
      />
    </>
  );
}
