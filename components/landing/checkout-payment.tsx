"use client";

import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  ImageIcon,
  QrCodeIcon,
  SpinnerIcon,
  TimerIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROOF_ACCEPTED_TYPES } from "@/lib/booking/constants";
import { proofFileProblem, shrinkProof, uploadProof } from "@/lib/booking/proof";
import type { HeldBooking } from "@/lib/booking/types";
import { cn } from "@/lib/utils";
import { formatPeso, isPlaceholder, PAYMENT_ACCOUNT_NAME, PAYMENT_QR_SRC } from "@/lib/venue";

import { PRESS } from "./press";

/** A hold as the sheet keeps it: the answer, and when it arrived on this device. */
export type HeldInSheet = HeldBooking & { receivedAt: number };

/** The screenshot, from choosing it to its upload landing (AC-9). */
export type ProofState =
  | { status: "empty" }
  | { status: "working"; preview: string | null; stage: "shrinking" | "uploading" }
  | { status: "done"; preview: string; blob: Blob }
  | { status: "failed"; preview: string | null; blob: Blob | null; message: string };

/**
 * The screenshot's life: shrink, upload, Replace, Retry. Lives in the sheet,
 * not the step, so Back and Review keep it.
 */
export function useProofUpload(signedUrl: string | null) {
  const [proof, setProof] = useState<ProofState>({ status: "empty" });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const previews = useRef<string[]>([]);
  // Only the newest choice may land, so a slow first upload cannot overwrite a Replace.
  const latest = useRef(0);

  useEffect(() => {
    const made = previews.current;
    return () => made.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const upload = useCallback(
    async (blob: Blob, preview: string, id: number) => {
      if (!signedUrl) return;
      setProof({ status: "working", preview, stage: "uploading" });
      try {
        await uploadProof(signedUrl, blob);
        if (id === latest.current) setProof({ status: "done", preview, blob });
      } catch {
        console.warn("checkout: the screenshot upload did not complete");
        if (id === latest.current) {
          setProof({
            status: "failed",
            preview,
            blob,
            message: "The upload didn't go through. Check your connection and retry.",
          });
        }
      }
    },
    [signedUrl],
  );

  const choose = useCallback(
    async (file: File) => {
      const problem = proofFileProblem(file);
      setFieldError(problem);
      if (problem) return;
      const id = ++latest.current;
      setProof({ status: "working", preview: null, stage: "shrinking" });
      let blob: Blob;
      try {
        blob = await shrinkProof(file);
      } catch {
        console.warn("checkout: the screenshot could not be read");
        if (id === latest.current) {
          setProof({
            status: "failed",
            preview: null,
            blob: null,
            message: "We couldn't read that image. Choose another screenshot.",
          });
        }
        return;
      }
      if (id !== latest.current) return;
      const preview = URL.createObjectURL(blob);
      previews.current.push(preview);
      await upload(blob, preview, id);
    },
    [upload],
  );

  const retry = useCallback(() => {
    if (proof.status !== "failed" || !proof.blob || !proof.preview) return;
    void upload(proof.blob, proof.preview, ++latest.current);
  }, [proof, upload]);

  return { proof, fieldError, choose, retry };
}

/**
 * Seconds left on the hold, by the server's clock (AC-8): the expiry minus the
 * server's `now` plus the time since the answer arrived. Never the device
 * clock alone, so a phone set five minutes fast still counts true.
 */
export function useHoldCountdown(held: HeldInSheet | null): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!held) return;
    const expires = new Date(held.holdExpiresAt).getTime();
    const serverNow = new Date(held.serverNow).getTime();
    const tick = () => {
      const now = serverNow + (Date.now() - held.receivedAt);
      setLeft(Math.max(0, Math.ceil((expires - now) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [held]);
  return held ? left : null;
}

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const HOLD_ENDED =
  "Your hold ended. You can still confirm, and we'll book the slots if they're still free.";

/**
 * The hold banner, pinned above the header on Payment and Review (AC-8,
 * AC-10, AC-27). The chip counts every second on screen; a screen reader
 * hears it only at a minute left and at zero, never every second.
 */
export function HoldBanner({ secondsLeft }: { secondsLeft: number | null }) {
  const ended = secondsLeft === 0;
  const announcement = ended
    ? HOLD_ENDED
    : secondsLeft !== null && secondsLeft <= 60
      ? "One minute left on your hold."
      : "";
  return (
    <div
      className={cn(
        "text-label flex items-center gap-3 rounded-2xl px-4 py-2.5",
        ended ? "bg-muted text-foreground" : "bg-state-booked text-state-booked-fg",
      )}
    >
      {ended ? (
        <WarningIcon aria-hidden="true" weight="bold" className="size-5 shrink-0" />
      ) : (
        <TimerIcon aria-hidden="true" weight="bold" className="size-5 shrink-0" />
      )}
      <p className="min-w-0 flex-1">{ended ? HOLD_ENDED : "Your slots are held for you"}</p>
      {ended || secondsLeft === null ? null : (
        <span className="bg-background text-foreground shrink-0 rounded-full px-2.5 py-0.5 tabular-nums">
          <span className="sr-only">Time left </span>
          {formatClock(secondsLeft)}
        </span>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/** The Payment step (AC-8, AC-9). The hold's countdown is the card's banner. */
export function PaymentStep({
  held,
  digits,
  onDigits,
  proof,
  fieldError,
  onChoose,
  onRetry,
}: {
  held: HeldInSheet;
  digits: string;
  onDigits: (digits: string) => void;
  proof: ProofState;
  fieldError: string | null;
  onChoose: (file: File) => void;
  onRetry: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const digitsId = useId();
  const proofId = useId();

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-muted flex flex-col items-center gap-4 rounded-2xl p-4 text-center">
        {isPlaceholder(PAYMENT_QR_SRC) ? (
          <div
            role="img"
            aria-label="The venue's GCash QR code will appear here"
            className="border-input text-muted-foreground flex size-60 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed"
          >
            <QrCodeIcon aria-hidden="true" className="size-10" />
            <span className="text-caption">{PAYMENT_QR_SRC}</span>
          </div>
        ) : (
          <Image
            src={PAYMENT_QR_SRC}
            alt={`GCash QR code to pay ${PAYMENT_ACCOUNT_NAME}`}
            width={240}
            height={240}
            className="bg-background size-60 rounded-xl"
          />
        )}
        <div className="flex flex-col gap-1">
          <p className="text-caption text-muted-foreground">Pay to</p>
          <p className="text-label">{PAYMENT_ACCOUNT_NAME}</p>
        </div>
        <p className="text-title tabular-nums">Send exactly {formatPeso(held.amount)}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={digitsId}>Last 4 digits of the reference number</Label>
        <Input
          id={digitsId}
          value={digits}
          onChange={(event) => onDigits(event.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]{4}"
          maxLength={4}
          placeholder="1234"
          aria-describedby={`${digitsId}-hint`}
          className="h-11 w-32 tracking-widest tabular-nums"
        />
        <p id={`${digitsId}-hint`} className="text-caption text-muted-foreground">
          From your GCash receipt.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={proofId}>Screenshot of your transfer</Label>
        <input
          ref={fileInput}
          id={proofId}
          type="file"
          accept={PROOF_ACCEPTED_TYPES.join(",")}
          className="sr-only"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={`${proofId}-status`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onChoose(file);
          }}
        />
        <ProofPreview proof={proof} />
        <div id={`${proofId}-status`} aria-live="polite" className="flex flex-col gap-1">
          {fieldError ? (
            <p className="text-caption text-destructive flex items-center gap-1.5">
              <WarningIcon aria-hidden="true" weight="bold" />
              {fieldError}
            </p>
          ) : null}
          <ProofStatus proof={proof} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInput.current?.click()}
            disabled={proof.status === "working"}
            className={cn("h-11 px-4", PRESS)}
          >
            <ImageIcon aria-hidden="true" weight="bold" data-icon="inline-start" />
            {proof.status === "empty" ? "Choose screenshot" : "Replace"}
          </Button>
          {proof.status === "failed" && proof.blob ? (
            <Button type="button" onClick={onRetry} className={cn("h-11 px-4", PRESS)}>
              <ArrowClockwiseIcon aria-hidden="true" weight="bold" data-icon="inline-start" />
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The thumbnail of what will be sent, once there is one. */
export function ProofPreview({ proof, className }: { proof: ProofState; className?: string }) {
  const preview = proof.status === "empty" ? null : proof.preview;
  if (!preview) return null;
  return (
    // An object URL of the player's own shrunk screenshot, never a remote image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={preview}
      alt="Your transfer screenshot"
      className={cn(
        "border-border max-h-40 w-fit rounded-xl border object-contain",
        proof.status === "working" ? "opacity-60" : "",
        className,
      )}
    />
  );
}

function ProofStatus({ proof }: { proof: ProofState }) {
  switch (proof.status) {
    case "empty":
      return <p className="text-caption text-muted-foreground">PNG, JPEG or WebP, up to 10 MB.</p>;
    case "working":
      return (
        <div className="flex flex-col gap-1.5">
          <p className="text-caption text-muted-foreground flex items-center gap-1.5">
            <SpinnerIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            {proof.stage === "shrinking" ? "Preparing your screenshot" : "Uploading"}
          </p>
          <div
            role="progressbar"
            aria-label="Upload progress"
            className="bg-muted h-1 w-full overflow-hidden rounded-full"
          >
            <div className="bg-primary h-full w-1/3 animate-pulse rounded-full motion-reduce:animate-none" />
          </div>
        </div>
      );
    case "done":
      return (
        <p className="text-caption flex items-center gap-1.5">
          <CheckCircleIcon aria-hidden="true" weight="fill" className="text-link" />
          Screenshot uploaded
        </p>
      );
    case "failed":
      return (
        <p className="text-caption text-destructive flex items-center gap-1.5">
          <WarningIcon aria-hidden="true" weight="bold" />
          {proof.message}
        </p>
      );
  }
}
