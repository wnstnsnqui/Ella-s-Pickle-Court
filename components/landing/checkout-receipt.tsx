"use client";

import {
  CheckIcon,
  CopyIcon,
  DownloadSimpleIcon,
  PencilSimpleIcon,
  SpinnerIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatBookingCode } from "@/lib/booking/code";
import type { BookingDetails } from "@/lib/booking/schemas";
import type { BookingReceipt } from "@/lib/booking/types";
import { formatAtVenue } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatPeso } from "@/lib/venue";

import type { PickRun } from "./booking";
import { ProofPreview, type ProofState } from "./checkout-payment";
import { Fact, Facts, InfoCard, SelectedCourts } from "./checkout-selection";
import { PRESS } from "./press";
import { receiptImageModel, renderReceiptImage, saveReceiptImage } from "./receipt-image";

/** What every step shows of the order: the day, the courts by name, and the runs with their price. */
export type OrderView = {
  heading: string;
  courts: readonly { id: number; name: string }[];
  runs: readonly PickRun[];
  amount: number;
};

/** "•••• 1234": the reference as Review and the receipt print it (AC-11, AC-14). */
function maskedReference(digits: string): string {
  return `•••• ${digits}`;
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn("text-link h-11 min-w-11 px-3", PRESS)}
    >
      <PencilSimpleIcon aria-hidden="true" weight="bold" data-icon="inline-start" />
      Edit<span className="sr-only"> {label}</span>
    </Button>
  );
}

/** Review, before Confirm booking, in three cards (AC-11). The picks are fixed, so only two edit. */
export function ReviewStep({
  order,
  details,
  digits,
  proof,
  onEditDetails,
  onEditPayment,
}: {
  order: OrderView;
  details: BookingDetails;
  digits: string;
  proof: ProofState;
  onEditDetails: () => void;
  onEditPayment: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <InfoCard title="Booking details">
        <SelectedCourts {...order} />
      </InfoCard>
      <InfoCard
        title="Your details"
        action={<EditButton label="your details" onClick={onEditDetails} />}
      >
        <Facts>
          <Fact term="Name">{details.name}</Fact>
          <Fact term="Mobile">{details.phone}</Fact>
          <Fact term="Email">{details.email}</Fact>
        </Facts>
      </InfoCard>
      <InfoCard title="Payment" action={<EditButton label="payment" onClick={onEditPayment} />}>
        <Facts>
          <Fact term="Method">QR transfer</Fact>
          <Fact term="Reference">{maskedReference(digits)}</Fact>
          <div className="flex items-center gap-3 pt-1">
            <ProofPreview proof={proof} className="max-h-16" />
            <span className="text-caption text-muted-foreground">Screenshot attached</span>
          </div>
        </Facts>
      </InfoCard>
    </div>
  );
}

/**
 * The receipt, the card's last step (AC-14). Everything here came back from
 * the submit. "Confirmed" is the player's word only: the booking stays
 * `pending_check` and reads "Payment not yet checked" to staff until
 * feature 17's check, so the chip is fixed copy, never `booking.status`.
 */
export function ReceiptStep({
  receipt,
  heading,
  courts,
}: {
  receipt: BookingReceipt;
  heading: string;
  courts: OrderView["courts"];
}) {
  const [copied, setCopied] = useState(false);
  const code = formatBookingCode(receipt.code);
  const model = useMemo(
    () => receiptImageModel(receipt, heading, courts),
    [receipt, heading, courts],
  );
  // Drawn as the receipt appears, not on the press: iOS refuses a share sheet
  // opened too long after the tap, and drawing waits on the font.
  const [image, setImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    let live = true;
    renderReceiptImage(model).then(
      (file) => {
        if (live) setImage(file);
      },
      () => console.warn("checkout: the receipt image could not be drawn"),
    );
    return () => {
      live = false;
    };
  }, [model]);

  async function save() {
    setSaving(true);
    setSaveFailed(false);
    try {
      await saveReceiptImage(image ?? (await renderReceiptImage(model)));
    } catch {
      console.warn("checkout: the receipt image could not be saved");
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      console.warn("checkout: the code could not be copied");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-muted flex flex-col items-center gap-3 rounded-2xl p-5 text-center">
        <p className="text-caption text-muted-foreground">Your booking code</p>
        <p className="text-display tracking-wider tabular-nums">{code}</p>
        <Button type="button" variant="outline" onClick={copy} className={cn("h-11 px-4", PRESS)}>
          {copied ? (
            <CheckIcon aria-hidden="true" weight="bold" data-icon="inline-start" />
          ) : (
            <CopyIcon aria-hidden="true" weight="bold" data-icon="inline-start" />
          )}
          {copied ? "Copied" : "Copy code"}
        </Button>
        <p aria-live="polite" className="sr-only">
          {copied ? "Booking code copied." : ""}
        </p>
      </div>

      <SelectedCourts
        heading={heading}
        courts={courts}
        runs={receipt.runs}
        amount={receipt.amount}
      />

      <InfoCard title="Customer">
        <Facts>
          <Fact term="Name">{receipt.customer.name}</Fact>
          {receipt.customer.phone ? <Fact term="Mobile">{receipt.customer.phone}</Fact> : null}
          {receipt.customer.email ? <Fact term="Email">{receipt.customer.email}</Fact> : null}
        </Facts>
      </InfoCard>

      <InfoCard title="Payment">
        <Facts>
          <Fact term="Method">QR transfer</Fact>
          <Fact term="Reference">{maskedReference(receipt.payment.referenceLast4)}</Fact>
          <Fact term="Proof">Screenshot received</Fact>
          <Fact term="Submitted">
            {formatAtVenue(receipt.payment.submittedAt, {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
          </Fact>
        </Facts>
      </InfoCard>

      <div className="ring-border flex items-center justify-between gap-4 rounded-2xl p-4 ring-1">
        <div className="flex flex-col">
          <span className="text-caption text-muted-foreground">Total paid</span>
          <span className="text-title tabular-nums">{formatPeso(receipt.amount)}</span>
        </div>
        <span className="bg-state-available text-state-available-fg border-state-available-border text-label inline-flex items-center gap-1.5 rounded-full border px-3 py-1">
          <CheckIcon aria-hidden="true" weight="bold" />
          Confirmed
        </span>
      </div>

      <p className="text-caption text-muted-foreground text-center">
        Staff check every payment. If yours doesn&apos;t match, we&apos;ll message you.
      </p>

      <div className="flex flex-col items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={save}
          disabled={saving}
          className={cn("h-11 w-full px-4", PRESS)}
        >
          {saving ? (
            <SpinnerIcon
              aria-hidden="true"
              data-icon="inline-start"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <DownloadSimpleIcon aria-hidden="true" weight="bold" data-icon="inline-start" />
          )}
          Save as image
        </Button>
        <p aria-live="polite" className="text-caption text-muted-foreground text-center">
          {saveFailed ? "We couldn't save the image. Take a screenshot of this page instead." : ""}
        </p>
      </div>
    </div>
  );
}
