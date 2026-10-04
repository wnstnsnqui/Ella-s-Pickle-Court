"use client";

import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useMemo } from "react";

import { ReceiptCard, SaveButtons, TrackLink } from "@/components/receipt/receipt-card";
import { buildReceiptView } from "@/components/receipt/receipt-view";
import { Button } from "@/components/ui/button";
import { PAYMENT_METHOD_LABEL } from "@/lib/booking/constants";
import type { BookingDetails } from "@/lib/booking/schemas";
import type { BookingReceipt } from "@/lib/booking/types";
import { cn } from "@/lib/utils";

import type { PickRun } from "./booking";
import { ProofPreview, type ProofState } from "./checkout-payment";
import { Fact, Facts, InfoCard, SelectedCourts } from "./checkout-selection";
import { PRESS } from "./press";

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
          <Fact term="Method">{PAYMENT_METHOD_LABEL}</Fact>
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
 * The receipt, the card's last step (spec 0015, AC-14). Everything here came
 * back from the submit. "Confirmed" is the player's word only: the booking
 * stays `pending_check` and reads "Payment not yet checked" to staff, so the
 * view's word is fixed copy, never `booking.status`. Spec 0017 (AC-16) adds
 * Save as PDF and Track this booking; the contact stays in full.
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
  const view = useMemo(
    () => buildReceiptView({ source: "checkout", receipt, heading, courts }),
    [receipt, heading, courts],
  );
  return (
    <ReceiptCard view={view}>
      <SaveButtons view={view} logLabel="checkout" />
      <TrackLink storedCode={view.storedCode} />
    </ReceiptCard>
  );
}
