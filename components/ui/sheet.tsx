"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Dialog as SheetPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import { XIcon } from "@phosphor-icons/react";

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        // The checkout card's dim (spec 0018, AC-11): the board stays legible
        // behind a sheet. Enter and exit live in `app/globals.css`.
        "bg-overlay-soft fixed inset-0 z-50",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "bg-popover text-popover-foreground elevation-float fixed z-50 flex flex-col rounded-3xl bg-clip-padding text-sm",
          // Floating, inset 8px from the edges it sits against (spec 0018,
          // AC-11). It slides in on the drawer curve and back out the same
          // way; the keyframes are `[data-slot="sheet-content"]` in
          // `app/globals.css`, and reduced motion only fades.
          "data-[side=bottom]:inset-x-2 data-[side=bottom]:bottom-2 data-[side=bottom]:h-auto",
          "data-[side=top]:inset-x-2 data-[side=top]:top-2 data-[side=top]:h-auto",
          "data-[side=right]:inset-y-2 data-[side=right]:right-2 data-[side=right]:w-[calc(100%-1rem)] data-[side=right]:max-w-md",
          "data-[side=left]:inset-y-2 data-[side=left]:left-2 data-[side=left]:w-[calc(100%-1rem)] data-[side=left]:max-w-md",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button
              variant="ghost"
              className="press absolute top-3 right-3 size-11 rounded-full"
              size="icon"
            >
              <XIcon weight="bold" className="size-5" />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-6", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-6", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading text-foreground text-base font-medium", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
