"use client";

import { ChatTextIcon, CheckIcon, CopyIcon, WarningIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBookingCode } from "@/lib/booking/code";
import {
  CANCEL_REASONS,
  NOTE_MAX,
  REFUND_MAX,
  REJECT_REASONS,
  refundDefault,
  type DecisionReason,
} from "@/lib/online-checks/constants";
import { formatAmount, formatRunStart } from "@/lib/online-checks/format";
import { buildPlayerMessage } from "@/lib/online-checks/messages";
import type { StaffBooking } from "@/lib/online-checks/types";
import { cn } from "@/lib/utils";
import { smsToHref } from "@/lib/venue";

import type { EndValues, SettleValues, StepOutcome } from "./use-online-booking";

/**
 * The steps a manager walks inside the booking's sheet. Spec 0016, AC-8 to
 * AC-10 and AC-12.
 *
 * Each step is a form in the sheet's body; its submit and Back sit in the
 * sheet's footer and point at it by `STEP_FORM_ID`. Opening a step moves focus
 * to its heading. Nothing here writes: the sheet's controller does.
 */

export const STEP_FORM_ID = "online-step-form";

/** Moves focus to the step's heading when it opens (AC-20). */
function useHeadingFocus() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return heading;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-caption text-destructive flex items-start gap-1">
      <WarningIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      {message}
    </p>
  );
}

/** Turn down payment, or Cancel booking. */
export function EndStep({
  kind,
  booking,
  timeZone,
  onSubmit,
}: {
  kind: "turn_down" | "cancel";
  booking: StaffBooking;
  timeZone: string;
  onSubmit: (values: EndValues) => Promise<StepOutcome>;
}) {
  const heading = useHeadingFocus();
  const reasons = kind === "turn_down" ? REJECT_REASONS : CANCEL_REASONS;
  const [reason, setReason] = useState<DecisionReason | null>(null);
  const [note, setNote] = useState("");
  // The box follows the reason until the manager ticks or unticks it themselves.
  const [refundTouched, setRefundTouched] = useState(false);
  const [refundTicked, setRefundTicked] = useState(() => refundDefault(kind, null, booking.status));
  const refundOwed = refundTouched ? refundTicked : refundDefault(kind, reason, booking.status);
  const [errors, setErrors] = useState<{ reason?: string; note?: string }>({});
  const ids = { reason: useId(), note: useId(), noteError: useId(), refund: useId() };

  const firstRun = booking.runs[0];
  const draft = reason
    ? buildPlayerMessage({
        reason,
        customerName: booking.customerName,
        code: formatBookingCode(booking.code),
        firstRun: firstRun ? formatRunStart(firstRun, timeZone) : "",
        amount: booking.amount,
        refundOwed,
      })
    : "";

  return (
    <form
      id={STEP_FORM_ID}
      noValidate
      className="flex flex-col gap-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const next: typeof errors = {};
        if (!reason) next.reason = "Pick a reason.";
        if (reason === "other" && note.trim() === "") next.note = "Say what happened in the note.";
        setErrors(next);
        if (next.reason || next.note || !reason) return;
        const outcome = await onSubmit({ reason, note: note.trim(), refundOwed });
        if (outcome?.issues) {
          setErrors({ reason: outcome.issues.reason?.[0], note: outcome.issues.note?.[0] });
        }
      }}
    >
      <h3 ref={heading} tabIndex={-1} className="text-title outline-none">
        {kind === "turn_down" ? "Turn down payment" : "Cancel booking"}
      </h3>
      <p className="text-body text-muted-foreground -mt-3">
        {kind === "turn_down"
          ? "The booking ends and every hour not yet played frees up on both boards."
          : "The whole booking ends, every court and hour not yet played, never one row."}
      </p>

      <fieldset
        aria-describedby={errors.reason ? ids.reason : undefined}
        className="flex flex-col gap-2"
      >
        <legend className="text-label mb-2">Reason</legend>
        {reasons.map((entry) => (
          <label
            key={entry.value}
            className={cn(
              "border-input text-body flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2",
              "has-checked:border-primary has-checked:bg-accent has-focus-visible:outline-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-solid",
            )}
          >
            <input
              type="radio"
              name="reason"
              value={entry.value}
              checked={reason === entry.value}
              onChange={() => {
                setReason(entry.value);
                setErrors((current) => ({ ...current, reason: undefined }));
              }}
              className="accent-primary size-4 shrink-0 outline-none"
            />
            {entry.label}
          </label>
        ))}
        <FieldError id={ids.reason} message={errors.reason} />
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.note}>
          Note {reason === "other" ? "(required for Other)" : "(optional)"}
        </Label>
        <Textarea
          id={ids.note}
          value={note}
          maxLength={NOTE_MAX}
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={errors.note ? ids.noteError : undefined}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What you saw, for the History"
        />
        <p className="text-caption text-muted-foreground tabular-nums">
          {note.length} of {NOTE_MAX}
        </p>
        <FieldError id={ids.noteError} message={errors.note} />
      </div>

      <div className="flex min-h-11 items-center gap-3">
        <Checkbox
          id={ids.refund}
          checked={refundOwed}
          onCheckedChange={(checked) => {
            setRefundTouched(true);
            setRefundTicked(checked === true);
          }}
        />
        <Label htmlFor={ids.refund} className="text-body">
          Money was received, a refund is owed
        </Label>
      </div>

      <MessagePanel
        kind={kind}
        draft={draft}
        phone={booking.customerPhone}
        email={booking.customerEmail}
      />
    </form>
  );
}

/**
 * The message to the player (AC-9). The text follows the reason and the
 * refund box until it is edited, then it stays as typed. Nothing is stored.
 */
function MessagePanel({
  kind,
  draft,
  phone,
  email,
}: {
  kind: "turn_down" | "cancel";
  draft: string;
  phone: string | null;
  email: string | null;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const text = typed ?? draft;
  const id = useId();

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="bg-muted/40 border-border flex flex-col gap-3 rounded-2xl border p-4"
    >
      <h4 id={`${id}-heading`} className="text-label flex items-center gap-2">
        <ChatTextIcon aria-hidden="true" className="size-4" />
        {kind === "turn_down"
          ? "Message the player before you turn this down."
          : "Message the player before you cancel."}
      </h4>
      {draft === "" && typed === null ? (
        <p className="text-caption text-muted-foreground">
          Pick a reason and the message is written for you.
        </p>
      ) : (
        <>
          <Label htmlFor={`${id}-text`} className="sr-only">
            Message
          </Label>
          <Textarea
            id={`${id}-text`}
            value={text}
            onChange={(event) => setTyped(event.target.value)}
            className="min-h-32"
          />
          <div className="flex flex-wrap gap-2">
            {phone ? (
              <Button asChild variant="outline" className="h-11 flex-1">
                <a href={smsToHref(phone, text)}>
                  <ChatTextIcon aria-hidden="true" />
                  Text the player
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
              {copied ? "Copied" : "Copy message"}
            </Button>
          </div>
          <p role="status" className="sr-only">
            {copied ? "Message copied" : ""}
          </p>
        </>
      )}
      <p className="text-caption text-muted-foreground break-words">
        Email: <span className="text-foreground select-all">{email ?? "Cleared"}</span>
      </p>
    </section>
  );
}

/** Mark refunded, or No refund needed (AC-12). */
export function RefundStep({
  outcome,
  booking,
  onSubmit,
}: {
  outcome: "refunded" | "not_owed";
  booking: StaffBooking;
  onSubmit: (values: SettleValues) => Promise<StepOutcome>;
}) {
  const heading = useHeadingFocus();
  const [amount, setAmount] = useState(String(booking.amount));
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ amount?: string; note?: string }>({});
  const ids = { amount: useId(), amountError: useId(), note: useId(), noteError: useId() };

  return (
    <form
      id={STEP_FORM_ID}
      noValidate
      className="flex flex-col gap-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const next: typeof errors = {};
        const value = Number(amount);
        if (outcome === "refunded") {
          if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || value <= 0) {
            next.amount = "Enter the amount sent back, like 1000 or 500.50.";
          } else if (value > REFUND_MAX) {
            next.amount = `A refund is at most ${formatAmount(REFUND_MAX)}.`;
          }
        }
        if (outcome === "not_owed" && note.trim() === "")
          next.note = "Say why no refund is needed.";
        setErrors(next);
        if (next.amount || next.note) return;
        const result = await onSubmit({
          amount: outcome === "refunded" ? value : undefined,
          note: note.trim(),
        });
        if (result?.issues) {
          setErrors({ amount: result.issues.amount?.[0], note: result.issues.note?.[0] });
        }
      }}
    >
      <h3 ref={heading} tabIndex={-1} className="text-title outline-none">
        {outcome === "refunded" ? "Mark refunded" : "No refund needed"}
      </h3>
      <p className="text-body text-muted-foreground -mt-3">
        {outcome === "refunded"
          ? "Record the money you sent back. This is final."
          : "Say why the venue owes nothing back, for example no money arrived. This is final."}
      </p>

      {outcome === "refunded" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.amount}>Amount sent back (₱)</Label>
          <Input
            id={ids.amount}
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? ids.amountError : undefined}
            className="h-11 tabular-nums"
          />
          <FieldError id={ids.amountError} message={errors.amount} />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.note}>
          Note {outcome === "not_owed" ? "(required)" : "(optional)"}
        </Label>
        <Textarea
          id={ids.note}
          value={note}
          maxLength={NOTE_MAX}
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={errors.note ? ids.noteError : undefined}
          onChange={(event) => setNote(event.target.value)}
          placeholder={outcome === "not_owed" ? "No money arrived" : "Sent by GCash, for example"}
        />
        <FieldError id={ids.noteError} message={errors.note} />
      </div>
    </form>
  );
}
