"use client";

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { useMediaQuery, WIDE_QUERY } from "./use-media-query";

/**
 * Every board sheet, in one shape. Spec 0005, AC-15, floating since spec
 * 0018, AC-11.
 *
 * From the bottom on a phone, so the thumb reaches the form; from the right
 * from 768 pixels, so the grid stays beside it and the person can still see
 * the hours they picked. Either way it floats 8px in from the edges over the
 * checkout card's soft dim. The body scrolls inside the sheet, never the page.
 * Its header is the checkout card's: a duotone icon in the icon chip, the
 * title and a muted line; its footer buttons are full height and press.
 *
 * The sheets open from code, not from a trigger element, so Radix has nothing
 * to hand focus back to on close. `returnFocusTo` is that element: the cell or
 * the bar button that opened the sheet (AC-15).
 */
export function BoardSheet({
  open,
  onOpenChange,
  icon: Icon,
  title,
  description,
  children,
  footer,
  returnFocusTo,
  compact = false,
  focusOnOpen = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The sheet's own icon, drawn duotone in the header's chip (spec 0018, AC-11). */
  icon: PhosphorIcon;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  /**
   * For content much shorter than a form: hug it on the bottom sheet instead of
   * reserving the usual near full height. The wide side stays as is; on a phone
   * screen it is the calendar picker's phone fallback (spec 0011), a popover on
   * anything wide enough to anchor one.
   */
  compact?: boolean;
  /**
   * Radix hands focus to the first field when a sheet opens, which is right for
   * a blank form but wrong for one that is already filled in: on a phone it
   * raises the keyboard over values the person opened the sheet to read. Pass
   * false and the panel itself takes focus instead, so the trap, Escape and Tab
   * still work without a field being claimed.
   */
  focusOnOpen?: boolean;
}) {
  const wide = useMediaQuery(WIDE_QUERY);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={wide ? "right" : "bottom"}
        onOpenAutoFocus={(event) => {
          if (focusOnOpen) return;
          event.preventDefault();
          const panel = event.currentTarget;
          if (panel instanceof HTMLElement) panel.focus();
        }}
        onCloseAutoFocus={(event) => {
          // The opener may be gone by now (the bar unmounts once a booking
          // lands), in which case the grid's own tab stop is the next best place.
          const opener = returnFocusTo?.current;
          const target =
            opener && opener.isConnected
              ? opener
              : document.querySelector<HTMLElement>('[role="grid"] [tabindex="0"]');
          if (target) {
            event.preventDefault();
            target.focus();
          }
        }}
        className={cn(
          // A sheet portals outside the shell, so it names press for its buttons itself.
          "[&_[data-slot=button]]:press gap-0",
          wide ? "" : compact ? "h-fit max-h-[85dvh]" : "max-h-[88dvh]",
        )}
      >
        <SheetHeader className="flex-row items-center gap-3 p-5 pr-16">
          <span aria-hidden="true" className="chip-icon">
            <Icon weight="duotone" className="size-6" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle className="text-title">{title}</SheetTitle>
            <SheetDescription className="text-caption text-muted-foreground">
              {description}
            </SheetDescription>
          </div>
        </SheetHeader>
        <div className={cn("min-h-0 overflow-y-auto px-5 pb-5", compact ? "" : "flex-1")}>
          {children}
        </div>
        {footer ? (
          <SheetFooter className="border-border [&_[data-slot=button]]:press border-t p-4 sm:p-5 [&_[data-slot=button]]:h-12">
            {footer}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
