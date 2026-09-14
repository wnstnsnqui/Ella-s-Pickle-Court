"use client";

import { useState } from "react";

import { LiveIndicator, type ChannelStatus } from "@/components/live-indicator";
import { CELL_VIEWS, CELL_VIEW_HINT, CELL_VIEW_NAME } from "@/components/schedule/cell-view";
import { ScheduleCell } from "@/components/schedule/schedule-cell";
import { ScheduleGrid, type GridView } from "@/components/schedule/schedule-grid";
import { Button } from "@/components/ui/button";
import { cellKey } from "@/components/schedule/cell-key";
import { sampleGrid } from "./sample";
import { ThemePane } from "./theme-pane";

/**
 * The seven cell views, and the grid in every state it can be. Spec 0003, AC-5
 * and AC-13.
 *
 * Both themes, side by side, because a state that reads clearly in one and
 * muddily in the other is exactly the failure this page exists to catch.
 */
export function CellStateGallery() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["light", "dark"] as const).map((theme) => (
        <ThemePane key={theme} theme={theme}>
          <ul className="flex flex-col gap-2">
            {CELL_VIEWS.map((view) => (
              <li key={view} className="flex items-center gap-3">
                <ScheduleCell view={view} label="Court 1 at 9am" className="w-court-col shrink-0" />
                <span className="min-w-0">
                  <span className="text-label block">{CELL_VIEW_NAME[view]}</span>
                  <span className="text-caption text-muted-foreground block">
                    {CELL_VIEW_HINT[view]}
                  </span>
                </span>
              </li>
            ))}
            {/* The two layers spec 0005 adds over a view: a name, and the lock. */}
            <li className="flex items-center gap-3">
              <ScheduleCell
                view="booked"
                caption="Maria Santos"
                label="Court 1 at 9am"
                className="w-court-col shrink-0"
              />
              <span className="min-w-0">
                <span className="text-label block">Booked, with the name</span>
                <span className="text-caption text-muted-foreground block">
                  What staff see on a taken hour
                </span>
              </span>
            </li>
            <li className="flex items-center gap-3">
              <ScheduleCell
                view="available"
                locked
                label="Court 1 at 9am"
                className="w-court-col shrink-0"
              />
              <span className="min-w-0">
                <span className="text-label block">Locked</span>
                <span className="text-caption text-muted-foreground block">
                  The hour has ended; only Ella may change it
                </span>
              </span>
            </li>
          </ul>
        </ThemePane>
      ))}
    </div>
  );
}

/** The grid itself, switchable through every state it can be handed. */
export function GridPreview({ date }: { date: string }) {
  const [kind, setKind] = useState<"ready" | "loading" | "no-courts" | "closed" | "error">("ready");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const view: GridView =
    kind === "ready"
      ? { kind: "ready", grid: sampleGrid(date) }
      : kind === "loading"
        ? { kind: "loading" }
        : kind === "error"
          ? { kind: "error", message: "The connection to the venue timed out." }
          : { kind: "empty", reason: kind === "no-courts" ? "no-courts" : "closed" };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(["ready", "loading", "no-courts", "closed", "error"] as const).map((option) => (
          <Button
            key={option}
            size="sm"
            variant={kind === option ? "default" : "outline"}
            aria-pressed={kind === option}
            onClick={() => setKind(option)}
          >
            {option}
          </Button>
        ))}
      </div>

      <p className="text-caption text-muted-foreground">
        Tab once to reach the grid, then walk it with the arrow keys. Home and End move along a row,
        Page Up and Page Down move a screenful, and Enter picks the hour.
      </p>

      <ScheduleGrid
        view={view}
        selectedCells={selected}
        onSelectCell={(courtId, startsAt) => {
          const key = cellKey(courtId, startsAt);
          setSelected((held) => {
            const next = new Set(held);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          });
        }}
        onRetry={() => setKind("ready")}
      />
    </div>
  );
}

/** The live indicator's three readings, without waiting for a real drop. */
export function LiveIndicatorPreview() {
  const [status, setStatus] = useState<ChannelStatus>("SUBSCRIBED");
  const [since, setSince] = useState(() => Date.now());

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSince(Date.now());
            setStatus("SUBSCRIBED");
          }}
        >
          Channel subscribed
        </Button>
        <Button size="sm" variant="outline" onClick={() => setStatus("CHANNEL_ERROR")}>
          Channel dropped
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">
        A drop reads as reconnecting for three seconds first, then admits the board is stale and
        says how old it is. Recover inside the window and it never says not live at all.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["light", "dark"] as const).map((theme) => (
          <ThemePane key={theme} theme={theme}>
            <LiveIndicator channelStatus={status} lastUpdatedAt={since} className="self-start" />
          </ThemePane>
        ))}
      </div>
    </div>
  );
}
