"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The bits every auth form shares. Spec 0004 (revised), AC-16.
 *
 * `FormError` is the one place a form level refusal shows: wrong password,
 * a used link, Postgres down. Field errors stay under their fields through
 * `FormMessage`. `SubmitButton` carries the pending state so a double tap on
 * a phone cannot send twice.
 */

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function SubmitButton({
  pending,
  children,
  pendingLabel,
  className,
}: {
  pending: boolean;
  children: React.ReactNode;
  pendingLabel: string;
  /** Full width by default, for the narrow auth surface; a wide card passes its own. */
  className?: string;
}) {
  return (
    <Button type="submit" disabled={pending} className={cn("w-full", className)}>
      {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
      {pending ? pendingLabel : children}
    </Button>
  );
}

/**
 * The action row at the foot of a form on the account page: a hairline, then
 * the button on the right with any note beside it, the same footer the
 * settings forms use so the two pages read alike.
 */
export function FormFooter({ note, children }: { note?: string; children: React.ReactNode }) {
  return (
    <div className="border-border flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      {note ? <p className="text-caption text-muted-foreground">{note}</p> : <span />}
      <div className="flex shrink-0 justify-end">{children}</div>
    </div>
  );
}
