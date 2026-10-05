"use client";

import {
  CheckCircleIcon,
  InfoIcon,
  SpinnerIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Sonner, wired to our tokens.
 *
 * shadcn ships this reading the theme from `next-themes`. We have no theme
 * provider on purpose: the colours here come from the token layer. The app is
 * light only, so sonner is pinned to `light`. `system` let it follow a device
 * in dark mode and paint its own near white description on our white toast.
 * The description reads `--muted-foreground` (5.4:1 on the popover); it needs
 * the `!` form because sonner's own stylesheet sits outside any cascade layer.
 */
function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CheckCircleIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <WarningIcon className="size-4" />,
        error: <XCircleIcon className="size-4" />,
        loading: <SpinnerIcon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          description: "text-muted-foreground!",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
