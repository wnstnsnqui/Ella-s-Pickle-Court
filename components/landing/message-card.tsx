"use client";

import { ArrowClockwiseIcon, ArrowRightIcon, ChatsCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ChannelButtons } from "./channels";

/**
 * What the booking section becomes when the live schedule cannot be read.
 * Spec 0013, AC-9 and AC-10.
 *
 * Deliberately not an error: no error words, no code, no status. It reads as
 * the other good way to book, because it is one. The failure itself is said
 * once, in the toast, and logged where only we see it.
 */
export function MessageCard({
  onTryAgain,
  pending = false,
  className,
}: {
  onTryAgain: () => void;
  /** A fresh read is on its way. */
  pending?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card ring-border flex flex-col items-start gap-5 rounded-3xl p-6 shadow-sm ring-1 sm:p-8",
        className,
      )}
    >
      <span className="bg-brand text-brand-foreground grid size-12 place-items-center rounded-2xl">
        <ChatsCircleIcon aria-hidden="true" weight="duotone" className="size-6" />
      </span>
      <div className="flex flex-col gap-2">
        <h3 className="text-title">Book by message</h3>
        <p className="text-body text-muted-foreground max-w-[48ch] text-pretty">
          Tell us the day and the hours you want, and we&apos;ll book the court for you.
        </p>
      </div>
      <ChannelButtons />
      <div className="border-border flex w-full flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Link
          href="/schedule"
          className="text-label text-link inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
        >
          See the live schedule
          <ArrowRightIcon aria-hidden="true" weight="bold" className="size-4" />
        </Link>
        <Button
          type="button"
          variant="ghost"
          onClick={onTryAgain}
          aria-disabled={pending}
          aria-busy={pending}
          className="text-muted-foreground aria-disabled:pointer-events-none"
        >
          <ArrowClockwiseIcon
            aria-hidden="true"
            data-icon="inline-start"
            className={cn(pending && "animate-spin motion-reduce:animate-none")}
          />
          Try again
        </Button>
      </div>
    </div>
  );
}
