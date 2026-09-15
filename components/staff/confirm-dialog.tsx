"use client";

import { TriangleAlert } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Ask before a cancel or a reopen. Spec 0005, AC-9.
 *
 * Keep is the safe choice and gets focus first, so a stray tap or an Enter
 * pressed too soon keeps the row rather than losing it.
 *
 * Spec 0007 reuses it for retiring a court and for saving hours that strand
 * bookings: `error` keeps a refusal inside the dialog (AC-6), and the two
 * labels can be renamed so the same shape reads right for a save (AC-9).
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  keepLabel?: string;
  confirmVariant?: "destructive" | "default";
  /** A refusal from the action, shown in the dialog so it stays open. */
  error?: string | null;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-label text-destructive flex items-start gap-2">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
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
          >
            {keepLabel}
          </Button>
          <Button type="button" variant={confirmVariant} disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
