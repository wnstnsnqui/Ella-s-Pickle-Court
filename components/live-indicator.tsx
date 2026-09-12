"use client";

import { Radio, RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Whether the board is still telling the truth. Spec 0003, AC-12.
 *
 * A realtime channel blips. Saying "not live" the instant one does would train
 * everybody to ignore the warning, so a drop reads as reconnecting for three
 * seconds first and only then admits the board is stale, with the age of the data
 * attached so a staff member can judge for themselves.
 *
 * The age is a client clock reading taken at the last successful render or
 * message. It is deliberately not a database value: it is about how long *this*
 * screen has been out of touch, which no server could answer.
 */
export type ChannelStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

/** How long a drop stays "reconnecting" before it becomes "not live". */
export const NOT_LIVE_AFTER_MS = 3_000;

type Reading = "live" | "reconnecting" | "stale";

export function LiveIndicator({
  channelStatus,
  lastUpdatedAt,
  className,
}: {
  channelStatus: ChannelStatus;
  /** Client clock at the last good server render or realtime message. */
  lastUpdatedAt: number;
  className?: string;
}) {
  const live = channelStatus === "SUBSCRIBED";

  // The only real state here is whether the three seconds have run out. Which of
  // the three readings that adds up to is derived, not stored, so the two can
  // never disagree.
  const [elapsed, setElapsed] = useState(false);
  const [now, setNow] = useState(lastUpdatedAt);

  // Reconnecting resets the window. Adjusting state during render rather than in
  // an effect is what stops a recovered channel painting "not live" for a frame.
  const [wasLive, setWasLive] = useState(live);
  if (wasLive !== live) {
    setWasLive(live);
    setElapsed(false);
  }

  const reading: Reading = live ? "live" : elapsed ? "stale" : "reconnecting";

  // A drop that recovers inside the window never shows as not live, because the
  // timer is thrown away the moment the channel comes back.
  useEffect(() => {
    if (live) return;
    const timer = setTimeout(() => {
      setElapsed(true);
      setNow(Date.now());
    }, NOT_LIVE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [live, lastUpdatedAt]);

  // The age only needs to tick while it is actually on screen.
  useEffect(() => {
    if (reading !== "stale") return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [reading]);

  const label =
    reading === "live"
      ? "Live"
      : reading === "reconnecting"
        ? "Reconnecting"
        : `Not live · ${formatAge(now - lastUpdatedAt)} old`;

  const Icon = reading === "live" ? Radio : reading === "reconnecting" ? RefreshCw : WifiOff;

  return (
    <p
      // Non urgent: the grid is still readable, so this must not interrupt.
      role="status"
      aria-live="polite"
      data-reading={reading}
      className={cn(
        "text-caption inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
        reading === "live" &&
          "border-state-available-border bg-state-available text-state-available-fg",
        reading === "reconnecting" && "border-border bg-muted text-muted-foreground",
        reading === "stale" && "border-destructive text-destructive",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-3.5", reading === "reconnecting" && "animate-spin")}
      />
      {label}
    </p>
  );
}

/** The age of the data in the coarsest unit that is still honest. */
export function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}
