"use client";

import {
  ArrowLeftIcon,
  ArrowUUpLeftIcon,
  CheckCircleIcon,
  InfoIcon,
  PencilSimpleIcon,
  ProhibitIcon,
  SpinnerIcon,
  TrashIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useCallback } from "react";

import { BoardSheet } from "@/components/board-sheet";
import { Button } from "@/components/ui/button";
import { formatBookingCode } from "@/lib/booking/code";
import { MANAGERS_ONLY_MESSAGE } from "@/lib/online-checks/constants";
import { formatRun } from "@/lib/online-checks/format";

import { OnlineBookingBlock } from "./online-booking-block";
import { EndStep, RefundStep, STEP_FORM_ID } from "./online-checks-steps";
import { useStaffBoard } from "./staff-schedule-context";
import { useOnlineBooking, type OnlineBookingController, type Step } from "./use-online-booking";

/**
 * The sheet's two halves for an online booking. Spec 0016, AC-6 to AC-12.
 *
 * The body is the check view, or the open step's form. The footer is built
 * from the viewer and the booking's state: Confirm payment, Turn down and
 * Cancel booking (unchecked), Turn down and Cancel booking (confirmed), Mark
 * refunded and No refund needed (a refund owed), with Edit beside them when the sheet came
 * from a row. Plain staff see no decision buttons, only why. Every button is
 * disabled while a call runs, so a double press sends one call (AC-14). The
 * destructive buttons are never the default focus (AC-20).
 */

export function OnlineBookingBody({
  controller,
  timeZone,
  withCustomer = true,
}: {
  controller: OnlineBookingController;
  timeZone: string;
  withCustomer?: boolean;
}) {
  const { load, step, notice, reload, end, settle } = controller;
  const booking = load.state === "loaded" ? load.booking : null;

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <p
          role="status"
          className="text-label bg-accent text-accent-foreground flex items-start gap-2 rounded-xl px-3 py-2"
        >
          <InfoIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {notice}
        </p>
      ) : null}
      {booking && step && (step.kind === "turn_down" || step.kind === "cancel") ? (
        <EndStep
          key={step.kind}
          kind={step.kind}
          booking={booking}
          timeZone={timeZone}
          onSubmit={(values) => end(step.kind as "turn_down" | "cancel", values)}
        />
      ) : booking && step?.kind === "refund" ? (
        <RefundStep
          key={step.outcome}
          outcome={step.outcome}
          booking={booking}
          onSubmit={(values) => settle(step.outcome, values)}
        />
      ) : (
        <OnlineBookingBlock
          load={load}
          timeZone={timeZone}
          onRetry={reload}
          withCustomer={withCustomer}
        />
      )}
    </div>
  );
}

/** Which footer button opens a step, as its `data-opens` names it. */
function stepKey(step: Step): string {
  return step.kind === "refund" ? `refund_${step.outcome}` : step.kind;
}

const STEP_SUBMIT: Record<Step["kind"] | "refund_not_owed", string> = {
  turn_down: "Turn down",
  cancel: "Cancel booking",
  refund: "Mark refunded",
  refund_not_owed: "No refund needed",
};

export function OnlineBookingFooter({
  controller,
  onEdit,
}: {
  controller: OnlineBookingController;
  /** Present when the sheet came from a row this person may change. */
  onEdit?: () => void;
}) {
  const { load, step, setStep, pending, confirm } = controller;
  const booking = load.state === "loaded" ? load.booking : null;
  // Back hands focus to the button that opened the step (AC-20). That button
  // is drawn afresh when the step closes, so it is found again by what it opens.
  const openStep = useCallback((next: Step) => () => setStep(next), [setStep]);

  const back = () => {
    const key = step ? stepKey(step) : null;
    setStep(null);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-opens="${key}"]`)?.focus();
    });
  };

  if (step) {
    const label =
      step.kind === "refund" && step.outcome === "not_owed" ? "refund_not_owed" : step.kind;
    return (
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-11" disabled={pending} onClick={back}>
          <ArrowLeftIcon aria-hidden="true" />
          Back
        </Button>
        <Button
          type="submit"
          form={STEP_FORM_ID}
          variant={step.kind === "refund" ? "default" : "destructive"}
          className="h-11"
          disabled={pending}
        >
          {pending ? <SpinnerIcon aria-hidden="true" className="animate-spin" /> : null}
          {pending ? "Saving" : STEP_SUBMIT[label]}
        </Button>
      </div>
    );
  }

  const edit = onEdit ? (
    <Button type="button" variant="outline" className="h-11 w-full" onClick={onEdit}>
      <PencilSimpleIcon aria-hidden="true" />
      Edit
    </Button>
  ) : null;

  if (!booking) return edit;

  const decides = booking.canDecide;
  const refundOwed = booking.refundStatus === "owed";
  const open = booking.status === "pending_check" || booking.status === "confirmed";

  return (
    <div className="flex flex-col gap-2">
      {booking.status === "held" ? (
        <p className="text-caption text-muted-foreground text-center">
          Held for checkout. It frees itself within 5 minutes if not paid.
        </p>
      ) : null}

      {open && !decides ? (
        <p role="note" className="text-caption text-muted-foreground text-center">
          {MANAGERS_ONLY_MESSAGE}
        </p>
      ) : null}

      {decides && booking.status === "pending_check" ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" className="h-11" disabled={pending} onClick={() => void confirm()}>
            {pending ? (
              <SpinnerIcon aria-hidden="true" className="animate-spin" />
            ) : (
              <CheckCircleIcon aria-hidden="true" />
            )}
            {pending ? "Saving" : "Confirm payment"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-11"
            disabled={pending}
            data-opens="turn_down"
            onClick={openStep({ kind: "turn_down" })}
          >
            <XCircleIcon aria-hidden="true" />
            Turn down payment
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="col-span-2 h-11"
            disabled={pending}
            data-opens="cancel"
            onClick={openStep({ kind: "cancel" })}
          >
            <TrashIcon aria-hidden="true" />
            Cancel booking
          </Button>
        </div>
      ) : null}

      {decides && booking.status === "confirmed" ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="destructive"
            className="h-11"
            disabled={pending}
            data-opens="turn_down"
            onClick={openStep({ kind: "turn_down" })}
          >
            <XCircleIcon aria-hidden="true" />
            Turn down payment
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-11"
            disabled={pending}
            data-opens="cancel"
            onClick={openStep({ kind: "cancel" })}
          >
            <TrashIcon aria-hidden="true" />
            Cancel booking
          </Button>
        </div>
      ) : null}

      {decides && refundOwed ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            className="h-11"
            disabled={pending}
            data-opens="refund_refunded"
            onClick={openStep({ kind: "refund", outcome: "refunded" })}
          >
            <ArrowUUpLeftIcon aria-hidden="true" />
            Mark refunded
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={pending}
            data-opens="refund_not_owed"
            onClick={openStep({ kind: "refund", outcome: "not_owed" })}
          >
            <ProhibitIcon aria-hidden="true" />
            No refund needed
          </Button>
        </div>
      ) : null}

      {edit}
    </div>
  );
}

/**
 * An online booking in its own sheet: from the list, a code search or the new
 * booking toast, whatever day the board is on (AC-2, AC-3, AC-5).
 */
export function OnlineBookingSheet({ timeZone }: { timeZone: string }) {
  const { openBookingId, closeBooking } = useStaffBoard();
  if (openBookingId === null) return null;
  return (
    <OpenBookingSheet
      key={openBookingId}
      bookingId={openBookingId}
      timeZone={timeZone}
      onClose={closeBooking}
    />
  );
}

function OpenBookingSheet({
  bookingId,
  timeZone,
  onClose,
}: {
  bookingId: number;
  timeZone: string;
  onClose: () => void;
}) {
  const { checks, refetch } = useStaffBoard();
  const onDecided = useCallback(() => {
    void refetch();
    void checks.refetch();
  }, [refetch, checks]);
  const controller = useOnlineBooking({
    bookingId,
    changeKey: String(checks.tick),
    onDecided,
  });
  const booking = controller.load.state === "loaded" ? controller.load.booking : null;
  const first = booking?.runs[0];

  return (
    <BoardSheet
      open
      onOpenChange={(open) => !open && !controller.pending && onClose()}
      focusOnOpen={false}
      title={booking?.customerName ?? "Online booking"}
      description={
        booking
          ? `${formatBookingCode(booking.code)}${first ? ` · ${formatRun(first, timeZone)}` : ""}`
          : "Loading the booking"
      }
      footer={<OnlineBookingFooter controller={controller} />}
    >
      <OnlineBookingBody controller={controller} timeZone={timeZone} />
    </BoardSheet>
  );
}
