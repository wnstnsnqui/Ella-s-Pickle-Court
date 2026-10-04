"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ListChecksIcon,
  QrCodeIcon,
  ScrollIcon,
  SpinnerIcon,
  UserIcon,
  WarningIcon,
  XIcon,
  type Icon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { ConfirmDialog, SOFT_OVERLAY } from "@/components/staff/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { captureBrowserException } from "@/lib/analytics/browser";
import {
  holdOnlineBooking,
  releaseOnlineBooking,
  submitOnlineBooking,
} from "@/lib/booking/actions";
import { formatBookingCode } from "@/lib/booking/code";
import { HOLD_TURNSTILE_ACTION } from "@/lib/booking/constants";
import {
  bookingDetailsSchema,
  EMPTY_BOOKING_DETAILS,
  referenceLast4Schema,
  type BookingDetails,
  type BookingDetailsInput,
} from "@/lib/booking/schemas";
import type { BookingReceipt, HeldBooking, HoldRefusal, SlotRef } from "@/lib/booking/types";
import { TURNSTILE_SITE_KEY } from "@/lib/env";
import { BOOKING_RULES } from "@/lib/legal/constants";
import { cn } from "@/lib/utils";

import { pickRuns, refundSmsBody, smsBody, type PickGroup } from "./booking";
import { ChannelButtons } from "./channels";
import {
  HoldBanner,
  PaymentStep,
  useHoldCountdown,
  useProofUpload,
  type HeldInSheet,
} from "./checkout-payment";
import { ReceiptStep, ReviewStep, type OrderView } from "./checkout-receipt";
import { SelectedCourts, SummaryLine } from "./checkout-selection";
import { PRESS } from "./press";
import { TurnstileWidget } from "./turnstile-widget";

/** What the card books: fixed when Book is pressed, for the life of the card (AC-1). */
export type CheckoutOrder = {
  date: string;
  heading: string;
  groups: PickGroup[];
  total: number;
  picks: SlotRef[];
  /** The day's slot length, so the picks merge into runs as the hold will write them. */
  slotMinutes: number;
};

/**
 * How the card ended, so the picker knows what to do with the picks:
 * `booked` reached the receipt (clear them and read the day, AC-14); `refund`
 * confirmed after a slot went (read the day so the taken ones show, AC-13);
 * `left` closed before any booking (the picks stand, and a hold, if there was
 * one, has been released, AC-15).
 */
export type CheckoutOutcome = "booked" | "refund" | "left";

/** The refusals that end the card and send the player back to the picker (AC-6, AC-7). */
export type PickerRefusal = Extract<HoldRefusal, { kind: "slot_taken" | "out_of_range" }>;

type Step = "details" | "terms" | "payment" | "review" | "receipt";

/** Every step in the order the card walks them, so a move knows if it went forward or back. */
const STEP_ORDER: readonly Step[] = ["details", "terms", "payment", "review", "receipt"];

/** Each step's progress name, header and icon (AC-1, AC-27). */
const STEPS: Record<Step, { name: string; heading: string; subtitle: string; icon: Icon }> = {
  details: {
    name: "Details",
    heading: "Your details",
    subtitle: "Who's playing, and how we reach you.",
    icon: UserIcon,
  },
  terms: {
    name: "Terms",
    heading: "Booking rules",
    subtitle: "Read and accept before you pay.",
    icon: ScrollIcon,
  },
  payment: {
    name: "Payment",
    heading: "Pay by GCash",
    subtitle: "Scan with your GCash app.",
    icon: QrCodeIcon,
  },
  review: {
    name: "Review",
    heading: "Check and confirm",
    subtitle: "Make sure everything is right.",
    icon: ListChecksIcon,
  },
  receipt: {
    name: "Done",
    heading: "Booking confirmed",
    subtitle: "Your code is how you find your booking.",
    icon: CheckIcon,
  },
};

/** Where Back goes from each step; the header arrow and the footer button share it (AC-27). */
const PREVIOUS: Record<Step, Step | null> = {
  details: null,
  terms: "details",
  payment: "terms",
  review: "payment",
  receipt: null,
};

/** The three boxes on Terms (AC-3), sent as `consent` once all three are ticked. */
type Consent = { rules: boolean; terms: boolean; privacy: boolean };
const NO_CONSENT: Consent = { rules: false, terms: false, privacy: false };
const FULL_CONSENT = { rules: true, terms: true, privacy: true } as const;

const CANT_CONTINUE = "We couldn't hold your slots just now. Try again, or message us to book.";
const CANT_CONFIRM =
  "We couldn't confirm your booking just now. Try again, or message us with your code.";

/** Stamp a hold with when its answer reached this device, for the countdown (AC-8). */
function arrived(held: HeldBooking): HeldInSheet {
  return { ...held, receivedAt: Date.now() };
}

/**
 * The bot check's state on the Terms step (AC-7): a failure gets one quiet
 * retry of the widget; a second means online booking cannot go on here.
 */
type BotCheck = "fine" | "retried" | "blocked";

/**
 * The online checkout card. Spec 0015, AC-1 to AC-15 and AC-27.
 *
 * A centered dialog on every width: the progress bar, the hold banner, the
 * header, a body that is the only part that scrolls, and a pinned footer.
 * Mounted fresh for every Book press (the picker keys it), so a new card is a
 * new `submission_id` and blank fields. Within one card every step keeps what
 * was typed: the details, the ticks, the digits and the screenshot live here,
 * not in a step, so Back and the Review Edit buttons never lose them.
 */
export function CheckoutSheet({
  open,
  onClose,
  order,
  returnFocusTo,
  onRefused,
  describeTaken,
}: {
  open: boolean;
  /** The card has closed, by any means; a live hold is already on its way to release. */
  onClose: (outcome: CheckoutOutcome) => void;
  order: CheckoutOrder;
  /** Where focus lands however the card closes: the booking section's heading (AC-27). */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  /** A pick is gone or the hours changed: the picker closes the card and reads the day. */
  onRefused: (refusal: PickerRefusal) => void;
  /** "Court 2 at 6pm was just booked.", in the grid's own names (AC-13). */
  describeTaken: (slots: readonly SlotRef[]) => string;
}) {
  // The capability for this card's hold: random, never shown, held only here (AC-5).
  const [submissionId] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState<Step>("details");
  // Which way the last move went, so the arriving step slides in from that side
  // (AC-25). Null until the first move: the card's own arrival covers Details.
  const [direction, setDirection] = useState<"forward" | "back" | null>(null);
  const [details, setDetails] = useState<BookingDetails | null>(null);
  const [consent, setConsent] = useState<Consent>(NO_CONSENT);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileAttempt, setTurnstileAttempt] = useState(0);
  const [botCheck, setBotCheck] = useState<BotCheck>("fine");
  const [retryAfterMinutes, setRetryAfterMinutes] = useState<number | null>(null);
  const [held, setHeld] = useState<HeldInSheet | null>(null);
  const [digits, setDigits] = useState("");
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null);
  const [refund, setRefund] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const { proof, fieldError, choose, retry } = useProofUpload(held?.upload.signedUrl ?? null);
  const secondsLeft = useHoldCountdown(held);

  const form = useForm<BookingDetailsInput, unknown, BookingDetails>({
    resolver: zodResolver(bookingDetailsSchema),
    defaultValues: EMPTY_BOOKING_DETAILS,
  });

  // AC-25: on a step change focus moves to that step's heading, so a screen
  // reader announces where the player is, and the body starts at its top.
  const title = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    body.current?.scrollTo({ top: 0 });
    title.current?.focus();
  }, [step]);

  function go(next: Step) {
    setProblem(null);
    setDirection(STEP_ORDER.indexOf(next) < STEP_ORDER.indexOf(step) ? "back" : "forward");
    setStep(next);
  }

  /** The widget failed, or Siteverify said no: one quiet retry, then give up here (AC-7). */
  const botCheckFailed = useCallback(() => {
    setTurnstileToken(null);
    if (botCheck === "fine") {
      setBotCheck("retried");
      setTurnstileAttempt((attempt) => attempt + 1);
    } else {
      setBotCheck("blocked");
    }
  }, [botCheck]);

  const consented = consent.rules && consent.terms && consent.privacy;

  async function hold() {
    if (!details || !consented || !turnstileToken || pending) return;
    setPending(true);
    setProblem(null);
    setRetryAfterMinutes(null);
    try {
      const result = await holdOnlineBooking({
        submissionId,
        date: order.date,
        picks: order.picks,
        name: details.name,
        phone: details.phone,
        email: details.email,
        consent: FULL_CONSENT,
        turnstileToken,
      });
      if (result.ok) {
        setHeld(arrived(result.data));
        setBotCheck("fine");
        go("payment");
        return;
      }
      const error = result.error;
      switch (error.kind) {
        case "slot_taken":
        case "out_of_range":
          onRefused(error);
          return;
        case "bot_check":
          botCheckFailed();
          return;
        case "rate_limited":
          setRetryAfterMinutes(Math.max(1, Math.ceil(error.retryAfterSeconds / 60)));
          break;
        default:
          setProblem(error.message);
      }
    } catch (error) {
      console.error("checkout: the hold request did not complete");
      captureBrowserException(error);
      setProblem(CANT_CONTINUE);
    } finally {
      setPending(false);
      // A token is single use: whatever happened, the next try needs a fresh one.
      setTurnstileToken(null);
      setTurnstileAttempt((attempt) => attempt + 1);
    }
  }

  async function confirm() {
    if (!held || pending) return;
    setPending(true);
    setProblem(null);
    try {
      const result = await submitOnlineBooking({ submissionId, referenceLast4: digits });
      if (result.ok) {
        setReceipt(result.data);
        go("receipt");
        return;
      }
      const error = result.error;
      if (error.kind === "slot_taken") {
        // AC-13: nothing was booked, but the player has paid.
        setRefund(
          `${describeTaken(error.slots)} You've already paid, so message us with your code ${formatBookingCode(held.code)} and the reference digits and we'll refund you or move your booking.`,
        );
        return;
      }
      setProblem(error.message);
    } catch (error) {
      console.error("checkout: the confirm request did not complete");
      captureBrowserException(error);
      setProblem(CANT_CONFIRM);
    } finally {
      setPending(false);
    }
  }

  /**
   * Every way out (the close button, Cancel, Escape, the overlay) comes
   * through here (AC-15, AC-27). A call in flight finishes first, so a hold or
   * a Confirm can never land after the player was told they left. From Payment
   * or Review, with digits typed or a screenshot chosen, the player is asked
   * before a hold they may have paid against is let go.
   */
  function requestClose() {
    if (pending) return;
    const booking = held !== null && receipt === null && refund === null;
    const paying =
      (step === "payment" || step === "review") && (digits !== "" || proof.status !== "empty");
    if (booking && paying) {
      setLeaving(true);
      return;
    }
    leave();
  }

  function leave() {
    setLeaving(false);
    if (held && receipt === null && refund === null) {
      // Not awaited: the card closes at once, and if this fails the minute
      // job frees the slots when the hold runs out.
      void releaseOnlineBooking({ submissionId }).catch((error: unknown) => {
        console.error("checkout: the release request did not complete");
        captureBrowserException(error);
      });
    }
    onClose(receipt ? "booked" : refund ? "refund" : "left");
  }

  const digitsValid = referenceLast4Schema.safeParse(digits).success;
  const paymentReady = digitsValid && proof.status === "done";

  // The order as every step shows it: the picks merged into runs at the
  // schedule's rate until the hold answers, then the hold's own runs and amount.
  const view: OrderView = {
    heading: order.heading,
    courts: order.groups.map((group) => group.court),
    runs: held
      ? held.runs
      : pickRuns(
          order.picks,
          order.slotMinutes,
          order.groups.map((group) => group.court.id),
        ),
    amount: held ? held.amount : order.total,
  };

  const meta = STEPS[step];
  const progress = STEP_ORDER.indexOf(step);
  const previous = refund ? null : PREVIOUS[step];
  const goBack = previous ? () => go(previous) : undefined;
  const showBanner = held !== null && refund === null && (step === "payment" || step === "review");
  const receiptShown = step === "receipt";

  const backButton = (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={goBack}
      disabled={pending}
      className={cn("h-12", PRESS)}
    >
      <ArrowLeftIcon aria-hidden="true" weight="bold" data-icon="inline-start" />
      Back
    </Button>
  );

  const primary = (label: string, onClick: () => void, enabled: boolean, busyLabel?: string) => (
    <Button
      type="button"
      size="lg"
      onClick={onClick}
      disabled={!enabled || pending}
      className={cn("h-12 flex-1", PRESS)}
    >
      {pending && busyLabel ? (
        <SpinnerIcon
          aria-hidden="true"
          className="animate-spin motion-reduce:animate-none"
          data-icon="inline-start"
        />
      ) : null}
      {pending && busyLabel ? busyLabel : label}
      {pending && busyLabel ? null : (
        <ArrowRightIcon aria-hidden="true" weight="bold" data-icon="inline-end" />
      )}
    </Button>
  );

  const wide = (label: string) => (
    <Button type="button" size="lg" onClick={requestClose} className={cn("h-12 w-full", PRESS)}>
      {label}
    </Button>
  );

  const footer =
    step === "details" ? (
      <>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={requestClose}
          className={cn("h-12", PRESS)}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          form="checkout-details"
          size="lg"
          className={cn("h-12 flex-1", PRESS)}
        >
          Next
          <ArrowRightIcon aria-hidden="true" weight="bold" data-icon="inline-end" />
        </Button>
      </>
    ) : step === "terms" ? (
      <>
        {backButton}
        {primary(
          "Next: Pay",
          hold,
          consented && turnstileToken !== null && botCheck !== "blocked",
          "Holding your slots",
        )}
      </>
    ) : step === "payment" ? (
      <>
        {backButton}
        {primary("Next", () => go("review"), paymentReady)}
      </>
    ) : step === "review" ? (
      refund ? (
        wide("Close")
      ) : (
        <>
          {backButton}
          {primary("Confirm booking", confirm, paymentReady, "Confirming")}
        </>
      )
    ) : (
      wide("Done")
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <DialogContent
        data-checkout-card=""
        showCloseButton={false}
        overlayProps={{ className: SOFT_OVERLAY }}
        onOpenAutoFocus={(event) => {
          // The heading, not the first field: on a phone a field would raise
          // the keyboard over the order before the player has read it.
          event.preventDefault();
          title.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          // However the card closes, focus goes to "Your booking", never the
          // page body (AC-27).
          const target = returnFocusTo?.current;
          if (target && target.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
        className="text-body flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-4xl p-0 sm:max-w-md"
      >
        {/* The top bar: back, the five segment progress bar, close. */}
        <div className="flex items-center gap-2 px-3 pt-3">
          {goBack ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={goBack}
              disabled={pending}
              aria-label={`Back to ${previous ? STEPS[previous].name : ""}`}
              className={cn("size-11 shrink-0 rounded-full", PRESS)}
            >
              <ArrowLeftIcon aria-hidden="true" weight="bold" className="size-5" />
            </Button>
          ) : (
            <span aria-hidden="true" className="size-11 shrink-0" />
          )}
          <Progress index={progress} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={requestClose}
            disabled={pending}
            aria-label="Close"
            className={cn("size-11 shrink-0 rounded-full", PRESS)}
          >
            <XIcon aria-hidden="true" weight="bold" className="size-5" />
          </Button>
        </div>
        <p className="sr-only">
          {receiptShown ? "Booking confirmed" : `Step ${progress + 1} of 4: ${STEPS[step].name}`}
        </p>

        {showBanner ? (
          <div className="px-5 pt-3">
            <HoldBanner secondsLeft={secondsLeft} />
          </div>
        ) : null}

        <div
          className={cn(
            "flex gap-3 px-5 pt-4 pb-4",
            receiptShown ? "flex-col items-center text-center" : "items-center",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "grid shrink-0 place-items-center",
              receiptShown
                ? "bg-state-available text-state-available-fg border-state-available-border size-14 rounded-full border-2"
                : "bg-primary text-primary-foreground size-11 rounded-2xl",
            )}
          >
            <meta.icon weight="bold" className={receiptShown ? "size-7" : "size-5"} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle
              ref={title}
              tabIndex={-1}
              className="text-title rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {meta.heading}
            </DialogTitle>
            <DialogDescription className="text-caption text-muted-foreground">
              {meta.subtitle}
            </DialogDescription>
          </div>
        </div>

        <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-5">
          {/* Keyed by step, so each step mounts fresh and plays its entrance. */}
          <section
            key={step}
            aria-label={meta.heading}
            data-step-enter={direction ?? undefined}
            className="flex flex-col gap-5"
          >
            {step === "details" ? (
              <>
                <SelectedCourts {...view} />
                <Form {...form}>
                  <form
                    id="checkout-details"
                    noValidate
                    onSubmit={form.handleSubmit((values) => {
                      setDetails(values);
                      go("terms");
                    })}
                    className="flex flex-col gap-4"
                  >
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input {...field} autoComplete="name" maxLength={80} className="h-11" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mobile number</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="tel"
                              inputMode="tel"
                              autoComplete="tel"
                              placeholder="0917 123 4567"
                              className="h-11"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="email"
                              inputMode="email"
                              autoComplete="email"
                              maxLength={254}
                              className="h-11"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </form>
                </Form>
              </>
            ) : step === "terms" ? (
              <>
                <SummaryLine {...view} />
                <TermsStep
                  consent={consent}
                  onConsent={setConsent}
                  pending={pending}
                  botCheck={botCheck}
                  turnstileAttempt={turnstileAttempt}
                  onTurnstileToken={setTurnstileToken}
                  onTurnstileFail={botCheckFailed}
                  retryAfterMinutes={retryAfterMinutes}
                  smsText={smsBody(order.heading, order.groups)}
                />
              </>
            ) : step === "payment" && held ? (
              <>
                <SummaryLine {...view} />
                <PaymentStep
                  held={held}
                  digits={digits}
                  onDigits={setDigits}
                  proof={proof}
                  fieldError={fieldError}
                  onChoose={choose}
                  onRetry={retry}
                />
              </>
            ) : step === "review" && details && held ? (
              refund ? (
                <div role="alert" className="flex flex-col gap-4">
                  <p className="text-body flex gap-2">
                    <WarningIcon
                      aria-hidden="true"
                      weight="bold"
                      className="text-destructive mt-1 shrink-0"
                    />
                    <span>{refund}</span>
                  </p>
                  <ChannelButtons body={refundSmsBody(held.code, digits)} />
                </div>
              ) : (
                <ReviewStep
                  order={view}
                  details={details}
                  digits={digits}
                  proof={proof}
                  onEditDetails={() => go("details")}
                  onEditPayment={() => go("payment")}
                />
              )
            ) : step === "receipt" && receipt ? (
              <ReceiptStep receipt={receipt} heading={order.heading} courts={view.courts} />
            ) : null}

            {problem ? (
              <p role="alert" className="text-body text-destructive flex gap-2">
                <WarningIcon aria-hidden="true" weight="bold" className="mt-1 shrink-0" />
                <span>{problem}</span>
              </p>
            ) : null}
          </section>
        </div>

        <div className="border-border flex gap-2 border-t px-5 py-4">{footer}</div>

        <ConfirmDialog
          open={leaving}
          onOpenChange={setLeaving}
          title="Leave checkout?"
          description="Your held slots will be released."
          keepLabel="Stay"
          confirmLabel="Leave"
          pending={false}
          onConfirm={leave}
          buttonClassName={cn("h-12", PRESS)}
          soft
        />
      </DialogContent>
    </Dialog>
  );
}

/** Five segments, filled up to the current step; all five on the receipt (AC-1). */
function Progress({ index }: { index: number }) {
  return (
    <div aria-hidden="true" className="grid flex-1 grid-cols-5 gap-1.5">
      {STEP_ORDER.map((step, i) => (
        <span
          key={step}
          className={cn(
            "h-1.5 rounded-full transition-colors duration-200",
            i <= index ? "bg-primary" : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}

/** One consent box: the whole label is the target, at least 44 pixels (AC-3). */
function ConsentBox({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl p-4 ring-1 transition-colors duration-150",
        checked ? "bg-state-selected ring-state-selected-border" : "bg-card ring-border",
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <span className="text-body">{children}</span>
    </label>
  );
}

function NewTabLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-link underline underline-offset-4"
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </Link>
  );
}

/** The rules, the three consent boxes and the bot check (AC-3, AC-7). */
function TermsStep({
  consent,
  onConsent,
  pending,
  botCheck,
  turnstileAttempt,
  onTurnstileToken,
  onTurnstileFail,
  retryAfterMinutes,
  smsText,
}: {
  consent: Consent;
  onConsent: (consent: Consent) => void;
  pending: boolean;
  botCheck: BotCheck;
  turnstileAttempt: number;
  onTurnstileToken: (token: string | null) => void;
  onTurnstileFail: () => void;
  retryAfterMinutes: number | null;
  smsText: string;
}) {
  const tick = (key: keyof Consent) => (checked: boolean) =>
    onConsent({ ...consent, [key]: checked });
  return (
    <div className="flex flex-col gap-4">
      {/* Scrolls on its own past 10rem, so a tab stop lets the keyboard scroll it too. */}
      <div
        role="region"
        aria-label="The venue's booking rules"
        tabIndex={0}
        className="ring-border max-h-40 overflow-y-auto rounded-2xl p-4 ring-1 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <ul className="text-body flex list-disc flex-col gap-2 pl-5">
          {BOOKING_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Before you pay</legend>
        <ConsentBox checked={consent.rules} onChange={tick("rules")} disabled={pending}>
          I agree to the venue&apos;s booking rules above.
        </ConsentBox>
        <ConsentBox checked={consent.terms} onChange={tick("terms")} disabled={pending}>
          I agree to the site&apos;s <NewTabLink href="/terms">Terms</NewTabLink> (governed by the
          laws of the Philippines).
        </ConsentBox>
        <ConsentBox checked={consent.privacy} onChange={tick("privacy")} disabled={pending}>
          I consent to the collection and use of my details as described in the{" "}
          <NewTabLink href="/privacy">Privacy notice</NewTabLink>, under the Data Privacy Act of
          2012 (Republic Act No. 10173).
        </ConsentBox>
      </fieldset>

      {botCheck === "blocked" ? (
        <div role="alert" className="flex flex-col gap-3">
          <p className="text-body">
            Online booking can&apos;t continue on this device. Message us and we&apos;ll book it for
            you.
          </p>
          <ChannelButtons body={smsText} />
        </div>
      ) : TURNSTILE_SITE_KEY ? (
        <TurnstileWidget
          siteKey={TURNSTILE_SITE_KEY}
          action={HOLD_TURNSTILE_ACTION}
          attempt={turnstileAttempt}
          onToken={onTurnstileToken}
          onFail={onTurnstileFail}
        />
      ) : null}

      {retryAfterMinutes !== null ? (
        <div role="alert" className="flex flex-col gap-3">
          <p className="text-body">
            Too many tries from this connection. Try again in {retryAfterMinutes}{" "}
            {retryAfterMinutes === 1 ? "minute" : "minutes"}, or message us.
          </p>
          <ChannelButtons body={smsText} />
        </div>
      ) : null}
    </div>
  );
}
