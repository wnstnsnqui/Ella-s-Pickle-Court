import {
  CalendarCheckIcon,
  CheckCircleIcon,
  LightningIcon,
  ProhibitIcon,
} from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

import type { HeroBoardData, HeroTile } from "./hero-data";

const TILE: Record<HeroTile, { label: string; icon: typeof CheckCircleIcon; className: string }> = {
  free: {
    label: "Free",
    icon: CheckCircleIcon,
    className: "bg-state-available text-state-available-fg border-state-available-border/40",
  },
  booked: {
    label: "Booked",
    icon: CalendarCheckIcon,
    className: "bg-state-booked text-state-booked-fg border-state-booked-border/40",
  },
  closed: {
    label: "Closed",
    icon: ProhibitIcon,
    className: "bg-state-unavailable text-state-unavailable-fg border-state-unavailable-border/40",
  },
};

/** "C1" for "Court 1", so five hour columns fit a phone; any other name as it is. */
function shortName(name: string): string {
  const match = /^court\s+(\S+)$/i.exec(name.trim());
  return match ? `C${match[1]}` : name;
}

/**
 * The hero's glimpse of the real board (spec 0013, AC-15): the next few hours
 * on every court, from the same read as the rest of the page, with the grid's
 * own state colours and icons, so the landing page and the board a player
 * lands on next read as the same thing.
 */
export function HeroBoard({ board }: { board: HeroBoardData }) {
  const today = board.day === "today";
  return (
    <figure className="relative mx-auto w-full max-w-md">
      <div className="bg-card text-card-foreground rounded-3xl p-4 shadow-2xl ring-1 shadow-[color-mix(in_oklch,var(--foreground)_18%,transparent)] ring-[color-mix(in_oklch,var(--foreground)_6%,transparent)] sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-caption text-muted-foreground">{today ? "Today" : "Tomorrow"}</p>
            <p className="text-title">Court schedule</p>
          </div>
          <p
            className={cn(
              "text-label inline-flex items-center gap-2 rounded-full px-3 py-1 whitespace-nowrap",
              today
                ? "text-state-available-fg bg-state-available"
                : "text-muted-foreground bg-muted",
            )}
          >
            {today ? (
              <span className="relative flex size-2">
                <span
                  data-ping
                  className="bg-state-available-border absolute inline-flex size-full rounded-full"
                />
                <span className="bg-state-available-border relative inline-flex size-2 rounded-full" />
              </span>
            ) : null}
            {board.caption}
          </p>
        </div>

        <table className="w-full table-fixed border-separate border-spacing-1.5">
          <caption className="sr-only">
            The next hours on every court, {today ? "today" : "tomorrow"}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-10">
                <span className="sr-only">Court</span>
              </th>
              {board.columns.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  className="text-caption text-muted-foreground pb-1 font-normal tabular-nums"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.courts.map((court, courtIndex) => (
              <tr key={court.id}>
                <th scope="row" className="text-label truncate pr-1 text-left font-medium">
                  <span aria-hidden="true">{shortName(court.name)}</span>
                  <span className="sr-only">{court.name}</span>
                </th>
                {board.columns.map((column) => {
                  const { tile } = column.tiles[courtIndex];
                  const { icon: Icon, label, className } = TILE[tile];
                  return (
                    <td
                      key={column.label}
                      className={cn(
                        "rounded-cell h-9 border text-center align-middle sm:h-10",
                        className,
                      )}
                    >
                      <Icon aria-hidden="true" weight="bold" className="mx-auto size-4" />
                      <span className="sr-only">{label}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <figcaption
        data-glass
        className="text-label bg-background/75 absolute -bottom-5 left-4 flex items-center gap-2 rounded-2xl px-3 py-2 shadow-lg ring-1 ring-[color-mix(in_oklch,var(--foreground)_8%,transparent)] backdrop-blur-xl sm:-left-6"
      >
        <span className="bg-mark text-mark-foreground grid size-7 place-items-center rounded-full">
          <LightningIcon aria-hidden="true" weight="fill" className="size-4" />
        </span>
        {board.chip}
      </figcaption>
    </figure>
  );
}
