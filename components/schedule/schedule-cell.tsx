"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { GlobeIcon, LockIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

import { CELL_VIEW_ICON, CELL_VIEW_NAME, type CellView } from "./cell-view";

/**
 * One hour on one court. Spec 0003, AC-5 and AC-8, in the landing's tile look
 * (spec 0018, AC-6).
 *
 * The cell is the grid's focus target rather than a button inside it, which is
 * what the ARIA grid pattern asks for: one tab stop for the whole grid, arrow
 * keys inside it. That means the keyboard activation a button would give for free
 * is written out here instead.
 *
 * The focus ring is inset on purpose. The time column is sticky and paints over
 * its neighbours, so a ring drawn outside the cell would be clipped in half the
 * moment the grid is scrolled sideways. The outline is never transitioned, so an
 * arrow key move lands at once. `outline-none` sets Tailwind's outline style
 * variable to none and `outline-2` reads it, so focus names `outline-solid` too.
 *
 * The look is the landing's tile: the icon and a word side by side, a soft edge
 * on Available that firms up under a fine pointer, no visible edge on Booked,
 * Unavailable, Outside opening hours or Saving, and Selected outlined and lifted.
 * The icon and the word carry the state, held to 3:1 and 4.5:1 on the tile's own
 * fill (spec 0018, AC-16), so the edge no longer has to.
 *
 * Two additions from spec 0005: a `caption`, which the staff board fills with
 * the customer's name (AC-2) in place of the view's word, and a `locked` variant
 * that dims a slot that has already ended for a staff member and adds a lock
 * beside the icon while keeping the view's own label (AC-11). Locked is a layer
 * over the view, not an eighth view, because the cell still *is* Booked or
 * Available.
 */
const cell = cva(
  [
    "relative flex h-row min-w-0 items-center justify-center gap-1.5 rounded-cell border px-2 text-cell tabular-nums select-none",
    "scroll-ml-time-col transition-[scale,background-color,border-color,color] duration-150 ease-out-strong",
    "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[-3px] focus-visible:outline-ring",
    "data-[changed=true]:animate-cell-changed",
  ],
  {
    variants: {
      view: {
        available: "bg-state-available text-state-available-fg border-state-available-border/30",
        booked: "bg-state-booked text-state-booked-fg border-transparent",
        unavailable: "bg-state-unavailable text-state-unavailable-fg border-transparent",
        "out-of-hours": "bg-state-outofhours text-state-outofhours-fg border-transparent",
        selected: "bg-state-selected text-state-selected-fg border-state-selected-border shadow-sm",
        saving: "bg-muted text-muted-foreground border-transparent",
        failed: "bg-destructive text-destructive-foreground border-destructive",
      },
      interactive: {
        true: "cursor-pointer active:scale-[0.96]",
        false: "cursor-default",
      },
      locked: {
        true: "opacity-60",
        false: "",
      },
      past: {
        true: "opacity-60",
        false: "",
      },
    },
    compoundVariants: [
      {
        // Only a tile something can act on answers a hover, and only to a
        // pointer that can hover precisely: a tap never leaves a stuck edge.
        view: "available",
        interactive: true,
        className: "pointer-fine:hover:border-state-available-border",
      },
    ],
    defaultVariants: { interactive: false, locked: false, past: false },
  },
);

/**
 * A caption that marks an online booking (spec 0016, AC-4): a globe beside
 * the name, and a word while the booking is still a checkout in progress
 * ("Held") or waiting for its payment check ("Check payment"). The cell's
 * colours and its view never change for it.
 */
export type CellCaption = {
  text: string;
  online?: "held" | "unchecked" | "checked";
};

const ONLINE_WORD = { held: "Held", unchecked: "Check payment", checked: null } as const;
const ONLINE_NAME = {
  held: ", online booking, held for checkout",
  unchecked: ", online booking, payment not yet checked",
  checked: ", online booking",
} as const;

export type ScheduleCellProps = {
  view: CellView;
  /** What this cell is, said in full for a screen reader: "Court 1 at 9am". */
  label: string;
  /** The roving tabindex: exactly one cell in a grid carries focus at a time. */
  focused?: boolean;
  /** True while this cell's state has just changed under the reader (AC-11). */
  changed?: boolean;
  /** The word beside the icon, in place of the view's own: the customer's name on a Booked cell. Always shown. */
  caption?: string | CellCaption;
  /**
   * The view's word shows at every width; otherwise only from 640px. The
   * landing's rule: true with two courts or fewer (spec 0018, AC-6).
   */
  roomy?: boolean;
  /** The slot has ended and this person may not change it (spec 0005, AC-11). */
  locked?: boolean;
  /** The slot has ended, read only: dimmed, no lock icon (spec 0006, AC-4). */
  past?: boolean;
  onSelect?: () => void;
  className?: string;
} & Omit<React.ComponentProps<"div">, "onSelect" | "children">;

export function ScheduleCell({
  view,
  label,
  focused = false,
  changed = false,
  caption,
  locked = false,
  past = false,
  roomy = false,
  onSelect,
  className,
  ...props
}: ScheduleCellProps) {
  const Icon = CELL_VIEW_ICON[view];
  const interactive = Boolean(onSelect);
  const { text, online } =
    typeof caption === "string" ? { text: caption, online: undefined } : (caption ?? {});
  const word = online ? ONLINE_WORD[online] : null;

  return (
    <div
      role="gridcell"
      tabIndex={focused ? 0 : -1}
      aria-disabled={interactive ? undefined : true}
      data-view={view}
      data-changed={changed || undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (!onSelect) return;
        // The cell is not a button, so Enter and Space are ours to honour.
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      data-locked={locked || undefined}
      data-past={past || undefined}
      className={cn(cell({ view, interactive, locked, past }), className)}
      {...props}
    >
      <Icon
        aria-hidden="true"
        weight="bold"
        className={cn("size-4 shrink-0", view === "saving" && "animate-spin")}
      />
      {locked ? <LockIcon aria-hidden="true" weight="bold" className="size-3 shrink-0" /> : null}
      {text ? (
        <span aria-hidden="true" className="flex min-w-0 items-center gap-1">
          {online ? <GlobeIcon weight="bold" className="size-3 shrink-0" /> : null}
          <span className="truncate">{word ? `${word} · ${text}` : text}</span>
        </span>
      ) : (
        <span aria-hidden="true" className={cn("min-w-0 truncate", !roomy && "hidden sm:inline")}>
          {CELL_VIEW_NAME[view]}
        </span>
      )}
      {/* The cell's accessible name, built from its contents: what it is, then how it reads. */}
      <span className="sr-only">
        {label}. {CELL_VIEW_NAME[view]}
        {text ? `, ${text}` : ""}
        {online ? ONLINE_NAME[online] : ""}
        {locked || past ? ", ended" : ""}
      </span>
    </div>
  );
}

export type ScheduleCellVariants = VariantProps<typeof cell>;
