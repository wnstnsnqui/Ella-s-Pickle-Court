"use client";

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
 * Every board sheet, in one shape. Spec 0005, AC-15.
 *
 * From the bottom on a phone, so the thumb reaches the form; from the right
 * from 768 pixels, so the grid stays beside it and the person can still see
 * the hours they picked. The body scrolls inside the sheet, never the page.
 *
 * The sheets open from code, not from a trigger element, so Radix has nothing
 * to hand focus back to on close. `returnFocusTo` is that element: the cell or
 * the bar button that opened the sheet (AC-15).
 */
export function BoardSheet({
  open,
  onOpenChange,
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
          "gap-0",
          wide
            ? "w-full sm:max-w-md"
            : compact
              ? "h-fit max-h-[85vh] rounded-t-lg"
              : "max-h-[88vh] rounded-t-lg",
        )}
      >
        <SheetHeader className="pr-12">
          <SheetTitle className="text-title">{title}</SheetTitle>
          <SheetDescription className="text-caption">{description}</SheetDescription>
        </SheetHeader>
        <div className={cn("min-h-0 overflow-y-auto px-4 pb-4", compact ? "" : "flex-1")}>
          {children}
        </div>
        {footer ? <SheetFooter className="border-border border-t">{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}
