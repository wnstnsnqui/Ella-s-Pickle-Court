"use client";

import { ImageBrokenIcon, MagnifyingGlassPlusIcon, WarningIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBookingCode } from "@/lib/booking/code";
import { getProofUrl } from "@/lib/online-checks/actions";

/**
 * The payment screenshot. Spec 0016, AC-17.
 *
 * A thumbnail beside the amount and the digits, loaded from a 5 minute URL
 * signed with the staff member's own token. The URL is asked for in the
 * browser when the sheet opens, never rendered into the page's HTML, and asked
 * for again when the full screen view opens after it lapsed. Pressing the
 * thumbnail opens the image fitted to the screen, with pinch zoom on touch.
 */

type Proof =
  | { state: "loading" }
  | { state: "ready"; url: string; expiresAt: number }
  | { state: "failed" }
  | { state: "deleted" };

/** A URL this close to lapsing is asked for again before it is used. */
const LAPSE_MARGIN_MS = 10_000;

export function ProofThumbnail({
  bookingId,
  code,
  hasProof,
}: {
  bookingId: number;
  code: string;
  hasProof: boolean;
}) {
  const [proof, setProof] = useState<Proof>(hasProof ? { state: "loading" } : { state: "deleted" });
  const [viewing, setViewing] = useState(false);
  const generation = useRef(0);

  /** Ask for a fresh URL; lands only if no newer ask started since. */
  const request = useCallback(async (): Promise<Proof> => {
    const mine = ++generation.current;
    let next: Proof;
    try {
      const result = await getProofUrl({ bookingId });
      next = result.ok
        ? { state: "ready", url: result.data.url, expiresAt: Date.parse(result.data.expiresAt) }
        : result.error.kind === "not_found"
          ? { state: "deleted" }
          : { state: "failed" };
    } catch {
      next = { state: "failed" };
    }
    if (mine === generation.current) setProof(next);
    return next;
  }, [bookingId]);

  const ask = useCallback(() => {
    setProof({ state: "loading" });
    return request();
  }, [request]);

  useEffect(() => {
    // Starts in `loading`; the URL is only ever made in the browser, never in the HTML.
    if (hasProof) void request();
  }, [request, hasProof]);

  const open = async () => {
    if (proof.state === "ready" && proof.expiresAt - Date.now() > LAPSE_MARGIN_MS) {
      setViewing(true);
      return;
    }
    const next = await ask();
    if (next.state === "ready") setViewing(true);
  };

  const alt = `Payment screenshot for booking ${formatBookingCode(code)}`;

  if (!hasProof || proof.state === "deleted") {
    return (
      <div className="border-border bg-muted text-caption text-muted-foreground flex h-28 w-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-2 text-center">
        <ImageBrokenIcon aria-hidden="true" className="size-5" />
        Screenshot deleted
      </div>
    );
  }

  if (proof.state === "failed") {
    return (
      <div className="flex w-24 flex-col items-start gap-2">
        <p role="alert" className="text-caption text-destructive flex items-start gap-1">
          <WarningIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          The screenshot did not load.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11"
          onClick={() => void ask()}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (proof.state === "loading") {
    return <Skeleton aria-label="Loading the screenshot" className="h-28 w-24 rounded-xl" />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void open()}
        className="group border-input focus-visible:ring-ring/50 relative h-28 w-24 overflow-hidden rounded-xl border outline-none focus-visible:ring-[3px]"
      >
        {/* A signed Storage URL, made in the browser: never `next/image`, which would proxy and cache it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={proof.url}
          alt={alt}
          className="size-full object-cover"
          onError={() => setProof({ state: "failed" })}
        />
        <span className="bg-background/90 text-caption text-foreground absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 py-1">
          <MagnifyingGlassPlusIcon aria-hidden="true" className="size-3.5" />
          Open
        </span>
      </button>

      <Dialog open={viewing} onOpenChange={setViewing}>
        <DialogContent className="flex h-[92dvh] max-w-[calc(100%-1rem)] flex-col gap-2 p-2 sm:max-w-3xl">
          <DialogTitle className="text-label px-2 pt-2 pr-12">Payment screenshot</DialogTitle>
          <DialogDescription className="sr-only">
            Booking {formatBookingCode(code)}. Pinch to zoom on a touch screen.
          </DialogDescription>
          <div className="min-h-0 flex-1 touch-pan-x touch-pan-y touch-pinch-zoom overflow-auto rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proof.url}
              alt={alt}
              className="mx-auto h-full w-full object-contain"
              onError={() => {
                setViewing(false);
                setProof({ state: "failed" });
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
