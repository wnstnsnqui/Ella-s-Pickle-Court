"use client";

import { WarningIcon } from "@phosphor-icons/react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** The checkout card's dim and blur (spec 0015, AC-27). */
export const SOFT_OVERLAY = "bg-overlay-soft supports-backdrop-filter:backdrop-blur-[6px]";

/**
 * Ask before a cancel or a reopen. Spec 0005, AC-9.
 *
 * Keep is the safe choice and gets focus first, so a stray tap or an Enter
 * pressed too soon keeps the row rather than losing it.
 *
 * Spec 0007 reuses it for retiring a court and for saving hours that strand
 * bookings: `error` keeps a refusal inside the dialog (AC-6), and the two
 * labels can be renamed so the same shape reads right for a save (AC-9).
 *
 * Spec 0015 reuses it before closing a checkout that has payment in it
 * (AC-15), where `buttonClassName` brings the landing page's taller targets
 * and `soft` keeps the checkout card's lighter dim (AC-27), so stacking this on
 * the card never jumps to the dark staff overlay.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  keepLabel = "Keep",
  confirmVariant = "destructive",
  error,
  pending,
  onConfirm,
  buttonClassName,
  soft = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Omit it to show only the keep button, when there is nothing to confirm. */
  confirmLabel?: string;
  keepLabel?: string;
  confirmVariant?: "destructive" | "default";
  /** A refusal from the action, shown in the dialog so it stays open. */
  error?: string | null;
  pending: boolean;
  onConfirm: () => void;
  /** Extra classes for both buttons, e.g. a taller target on a public page. */
  buttonClassName?: string;
  /** Dim with `--overlay-soft` rather than `--overlay`. */
  soft?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayProps={soft ? { className: SOFT_OVERLAY } : undefined}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-label text-destructive flex items-start gap-2">
            <WarningIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            autoFocus
            disabled={pending}
            onClick={() => onOpenChange(false)}
            className={buttonClassName}
          >
            {keepLabel}
          </Button>
          {confirmLabel ? (
            <Button
              type="button"
              variant={confirmVariant}
              disabled={pending}
              onClick={onConfirm}
              className={buttonClassName}
            >
              {confirmLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
