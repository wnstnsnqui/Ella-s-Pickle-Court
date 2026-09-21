"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * The staff header's controls, collapsed behind one button below the `lg`
 * breakpoint (1024px), where showing every item inline wraps and crowds the
 * brand band. Opens a dropdown with the same items, stacked and fully labelled.
 *
 * Closing on any click inside covers the theme toggle and the Sign out a
 * switched off account still gets here, which do not navigate away on their
 * own; a page link closes it anyway, since choosing one unmounts this header
 * and remounts the next page's.
 */
export function NavMenu({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("lg:hidden", className)}
          aria-label="Menu"
        >
          <Menu aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={() => setOpen(false)}
        className="flex min-w-48 flex-col gap-1 [&>[data-slot=button]]:w-full [&>[data-slot=button]]:justify-start"
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
