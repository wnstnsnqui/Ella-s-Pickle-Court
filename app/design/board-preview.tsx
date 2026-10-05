"use client";

import { CalendarPlusIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";

import { BoardCard } from "@/components/board-card";
import { BoardDayHeader } from "@/components/board-day-header";
import { BoardSheet } from "@/components/board-sheet";
import { LiveIndicator, type ChannelStatus } from "@/components/live-indicator";
import { CELL_VIEWS, CELL_VIEW_HINT, CELL_VIEW_NAME } from "@/components/schedule/cell-view";
import { ScheduleCell } from "@/components/schedule/schedule-cell";
import { ScheduleGrid, type GridView } from "@/components/schedule/schedule-grid";
import { Button } from "@/components/ui/button";
import { cellKey } from "@/components/schedule/cell-key";
import { SAMPLE_HORIZON_DAYS, SAMPLE_TIMEZONE, sampleGrid } from "./sample";
import { ThemePane } from "./theme-pane";

/**
 * The seven cell views, and the grid in every state it can be. Spec 0003, AC-5
 * and AC-13, in the landing's tile look (spec 0018, AC-6): each view with its
 * word, and again with a name in its place, as the staff board shows a booking.
 */
export function CellStateGallery() {
  return (
    <ThemePane>
      <ul className="flex flex-col gap-2">
        {CELL_VIEWS.map((view) => (
          <li key={view} className="flex flex-wrap items-center gap-3">
            <ScheduleCell view={view} label="Court 1 at 9am" roomy className="w-36 shrink-0" />
            <ScheduleCell
              view={view}
              label="Court 1 at 9am"
              caption="Maria Santos"
              className="w-36 shrink-0"
            />
            <span className="min-w-0">
              <span className="text-label block">{CELL_VIEW_NAME[view]}</span>
              <span className="text-caption text-muted-foreground block">
                {CELL_VIEW_HINT[view]}
              </span>
            </span>
          </li>
        ))}
        {/* The layers specs 0005 and 0016 add over a view: an online booking, and the lock. */}
        <li className="flex flex-wrap items-center gap-3">
          <ScheduleCell
            view="booked"
            caption={{ text: "Maria Santos", online: "unchecked" }}
            label="Court 1 at 9am"
            className="w-36 shrink-0"
          />
          <span className="min-w-0">
            <span className="text-label block">Booked online, payment to check</span>
            <span className="text-caption text-muted-foreground block">
              The globe and a word, never a new colour
            </span>
          </span>
        </li>
        <li className="flex flex-wrap items-center gap-3">
          <ScheduleCell
            view="available"
            locked
            roomy
            label="Court 1 at 9am"
            className="w-36 shrink-0"
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
  );
}

/**
 * The board card as both boards wear it (spec 0018, AC-5, AC-8): the day
 * heading with the live pill beside it, the day strip with the calendar at
 * its end, the legend and the grid, switchable through every state the grid
 * can be handed. The strip moves the sample day at once; there is no read.
 */
export function GridPreview({ date }: { date: string }) {
  const [shown, setShown] = useState(date);
  const [kind, setKind] = useState<"ready" | "loading" | "no-courts" | "closed" | "error">("ready");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  // The public board's clock (spec 0006, AC-4): 11:20 at the venue, so the
  // morning is dimmed and the marker sits before the 11am row.
  const [withClock, setWithClock] = useState(false);
  const now = `${date}T03:20:00.000Z`;

  const view: GridView =
    kind === "ready"
      ? { kind: "ready", grid: sampleGrid(shown) }
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
            variant={kind === option ? "ink" : "outline"}
            aria-pressed={kind === option}
            onClick={() => setKind(option)}
            className="press h-10 rounded-full px-4"
          >
            {option}
          </Button>
        ))}
      </div>

      <p className="text-caption text-muted-foreground">
        Tab once to reach the grid, then walk it with the arrow keys. Home and End move along a row,
        Page Up and Page Down move a screenful, and Enter picks the hour.
      </p>

      <Button
        variant={withClock ? "ink" : "outline"}
        aria-pressed={withClock}
        onClick={() => setWithClock((held) => !held)}
        className="press h-10 self-start rounded-full px-4"
      >
        Past hours dimmed, Now marker
      </Button>

      <BoardCard
        header={
          <BoardDayHeader
            date={shown}
            onNavigate={setShown}
            timezone={SAMPLE_TIMEZONE}
            horizonDays={SAMPLE_HORIZON_DAYS}
            now={`${date}T03:20:00.000Z`}
            closedDays={[]}
            aside={<LiveIndicator channelStatus="SUBSCRIBED" lastUpdatedAt={0} />}
          />
        }
      >
        <ScheduleGrid
          view={view}
          now={withClock ? now : undefined}
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
      </BoardCard>
    </div>
  );
}

/**
 * The live pill's three readings (spec 0018, AC-9), without waiting for a real
 * drop. No board shows the pill today; this is where it lives.
 */
export function LiveIndicatorPreview() {
  const [status, setStatus] = useState<ChannelStatus>("SUBSCRIBED");
  const [since, setSince] = useState(() => Date.now());

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setSince(Date.now());
            setStatus("SUBSCRIBED");
          }}
          className="press h-10 rounded-full px-4"
        >
          Channel subscribed
        </Button>
        <Button
          variant="outline"
          onClick={() => setStatus("CHANNEL_ERROR")}
          className="press h-10 rounded-full px-4"
        >
          Channel dropped
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">
        A drop reads as reconnecting for three seconds first, then admits the board is stale and
        says how old it is. Recover inside the window and it never says not live at all.
      </p>
      <ThemePane>
        <LiveIndicator channelStatus={status} lastUpdatedAt={since} className="self-start" />
      </ThemePane>
    </div>
  );
}

/** A floating board sheet (spec 0018, AC-11), opened here rather than from a board. */
export function SheetPreview() {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex flex-col gap-3">
      <Button
        ref={opener}
        variant="outline"
        onClick={() => setOpen(true)}
        className="press h-10 self-start rounded-full px-4"
      >
        Open a sheet
      </Button>
      <BoardSheet
        open={open}
        onOpenChange={setOpen}
        icon={CalendarPlusIcon}
        title="Book"
        description="2 hours on 2 courts. One booking per run, all under the same name."
        returnFocusTo={opener}
        footer={
          <Button type="button" onClick={() => setOpen(false)} className="w-full">
            Book 2 hours on 2 courts
          </Button>
        }
      >
        <p className="text-body text-muted-foreground">
          From the right, 8px in from the edges, from 768px; from the bottom below that. It slides
          in on the drawer curve and leaves the same way, faster. With motion reduced it only fades.
        </p>
      </BoardSheet>
    </div>
  );
}
