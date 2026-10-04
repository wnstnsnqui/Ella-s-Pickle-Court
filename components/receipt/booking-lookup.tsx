"use client";

import {
  ArrowClockwiseIcon,
  ClockCountdownIcon,
  MagnifyingGlassIcon,
  QuestionIcon,
  SpinnerIcon,
  TicketIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";

import { bookingCodeSmsBody } from "@/components/landing/booking";
import { ChannelButtons } from "@/components/landing/channels";
import { PRESS } from "@/components/landing/press";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupBooking } from "@/lib/booking/actions";
import { formatBookingCode } from "@/lib/booking/code";
import { LOOKUP_FAILED_MESSAGE } from "@/lib/booking/lookup";
import { BOOKING_CODE_HINT, bookingCodeSchema } from "@/lib/booking/schemas";
import type { LookupResult } from "@/lib/booking/types";
import { formatAtVenue } from "@/lib/time";
import { cn } from "@/lib/utils";

import { ReceiptCard, SaveButtons } from "./receipt-card";
import { buildReceiptView, type ReceiptView } from "./receipt-view";

/**
 * The lookup on `/booking` (spec 0017). The code is held only in this
 * component's memory: never `localStorage`, never a URL (AC-11). A code that
 * cannot be one is caught here and again in the action, and never reaches
 * the database (AC-2).
 */

/** A result the page shows: anything but `invalid`, which lives on the field. */
type Shown = Exclude<LookupResult, { ok: false; error: { kind: "invalid" } }>;

const NOTICE: Record<
  Exclude<Extract<Shown, { ok: false }>["error"]["kind"], "invalid">,
  { title: string; icon: typeof QuestionIcon }
> = {
  not_found: { title: "No booking found", icon: QuestionIcon },
  ended: { title: "This booking has ended", icon: TicketIcon },
  rate_limited: { title: "Too many tries", icon: ClockCountdownIcon },
  failed: { title: "Something went wrong", icon: WarningCircleIcon },
};

export function BookingLookup() {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const [typed, setTyped] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  /** Bumped for a new result only, so it plays its entrance and takes focus; a re-read keeps it. */
  const [arrival, setArrival] = useState(0);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [rereadFailed, setRereadFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();
  const [rereading, setRereading] = useState(false);
  /** The code behind the result on screen, for rendering; `held` is the same for the callbacks. */
  const [heldCode, setHeldCode] = useState<string | null>(null);

  /** The code behind the result on screen, as stored. Memory only. */
  const held = useRef<string | null>(null);
  const shownRef = useRef<Shown | null>(null);
  const latest = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  // AC-3: when a new result appears, focus goes to its heading.
  useEffect(() => {
    if (arrival > 0) heading.current?.focus();
  }, [arrival]);

  /** Look up a code already in its stored form, and show whatever comes back as a new result. */
  const lookUp = useCallback((code: string, fill: boolean) => {
    const id = ++latest.current;
    startTransition(async () => {
      // AC-13: a call that never reaches the server (offline, dropped) rejects
      // here rather than answering `failed`. Left to throw, the transition
      // hands it to the error boundary and the whole page goes.
      let result: LookupResult;
      try {
        result = await lookupBooking({ code });
      } catch {
        result = { ok: false, error: { kind: "failed", message: LOOKUP_FAILED_MESSAGE } };
      }
      if (id !== latest.current) return;
      if (!result.ok && result.error.kind === "invalid") {
        setFieldError(result.error.message);
        return;
      }
      held.current = code;
      setHeldCode(code);
      // A code handed over in the fragment shows in the field once it is read.
      if (fill) setTyped(formatBookingCode(code));
      setShown(result as Shown);
      setCheckedAt(new Date());
      setRereadFailed(false);
      setAnnouncement("");
      setArrival((n) => n + 1);
    });
  }, []);

  /** The form: a code as typed, checked here first so a malformed one never leaves the page. */
  function find(raw: string) {
    const parsed = bookingCodeSchema.safeParse(raw);
    if (!parsed.success) {
      setFieldError(BOOKING_CODE_HINT);
      return;
    }
    setFieldError(null);
    lookUp(parsed.data, false);
  }

  /**
   * AC-12: the same code again, swapped in place without moving focus. A
   * changed status is announced. A failed re-read keeps the receipt that is
   * already on screen, and says so beside Check again.
   */
  const reread = useCallback(async () => {
    const code = held.current;
    const before = shownRef.current;
    if (!code || !before?.ok) return;
    const id = ++latest.current;
    setRereading(true);
    try {
      const result = await lookupBooking({ code });
      if (id !== latest.current) return;
      if (!result.ok && (result.error.kind === "failed" || result.error.kind === "invalid")) {
        setRereadFailed(true);
        return;
      }
      setRereadFailed(false);
      setCheckedAt(new Date());
      setShown(result as Shown);
      if (!result.ok) {
        setAnnouncement(
          `Status changed: ${NOTICE[result.error.kind as keyof typeof NOTICE].title}`,
        );
      } else {
        const now = buildReceiptView({ source: "lookup", lookup: result.data });
        const was = buildReceiptView({ source: "lookup", lookup: before.data });
        if (now.status !== was.status) setAnnouncement(`Status changed: ${now.word}`);
      }
    } catch {
      if (id === latest.current) setRereadFailed(true);
    } finally {
      if (id === latest.current) setRereading(false);
    }
  }, []);

  // AC-11: "Track this booking" hands the code over in the fragment. Read it
  // once, look it up, and take it out of the address bar straight away.
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (!fragment) return;
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
    // A fragment that cannot be a code is dropped quietly: nobody typed it.
    let decoded = fragment;
    try {
      decoded = decodeURIComponent(fragment);
    } catch {
      // Not valid percent encoding: try it as it stands.
    }
    const parsed = bookingCodeSchema.safeParse(decoded);
    if (parsed.success) lookUp(parsed.data, true);
  }, [lookUp]);

  // AC-12: coming back to the tab reads the booking again.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void reread();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reread]);

  const view: ReceiptView | null =
    shown?.ok === true ? buildReceiptView({ source: "lookup", lookup: shown.data }) : null;

  return (
    <div className="flex flex-col gap-6">
      <section
        data-print-hide=""
        aria-labelledby={`${fieldId}-title`}
        className="bg-card ring-border flex flex-col gap-5 rounded-3xl p-6 shadow-sm ring-1"
      >
        <div className="flex items-center gap-3">
          <span className="bg-brand text-brand-foreground grid size-11 shrink-0 place-items-center rounded-2xl">
            <TicketIcon aria-hidden="true" weight="duotone" className="size-6" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h1 id={`${fieldId}-title`} className="text-title">
              Find your booking
            </h1>
            <p className="text-caption text-muted-foreground text-pretty">
              Type the code from your receipt to see where your booking stands.
            </p>
          </div>
        </div>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            find(typed);
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId} className="text-label">
              Booking code
            </Label>
            <Input
              id={fieldId}
              name="code"
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
                if (fieldError) setFieldError(null);
              }}
              placeholder="K7MQ-3XPT"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              maxLength={20}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? errorId : undefined}
              className="text-title h-12 text-center tracking-widest uppercase tabular-nums placeholder:tracking-widest placeholder:normal-case"
            />
            <p
              id={errorId}
              className={cn("text-caption text-destructive", fieldError ? "block" : "hidden")}
            >
              {fieldError}
            </p>
          </div>
          <Button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className={cn("bg-mark text-mark-foreground hover:bg-mark/90 h-12 px-5", PRESS)}
          >
            {pending ? (
              <SpinnerIcon
                aria-hidden="true"
                data-icon="inline-start"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <MagnifyingGlassIcon aria-hidden="true" weight="bold" data-icon="inline-start" />
            )}
            Find booking
          </Button>
        </form>
      </section>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {shown === null ? (
        <WhereIsMyCode />
      ) : view && shown.ok ? (
        <div key={arrival} data-lookup-result="" className="flex flex-col">
          <div className="bg-card ring-border rounded-3xl p-5 shadow-sm ring-1 print:p-0 print:shadow-none print:ring-0">
            <ReceiptCard view={view} headingRef={heading}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-caption text-muted-foreground" aria-live="polite">
                  {rereadFailed
                    ? "We couldn't check again just now."
                    : checkedAt
                      ? `Checked at ${formatAtVenue(checkedAt)}`
                      : ""}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void reread()}
                  aria-busy={rereading}
                  className={cn("text-link h-11 px-3", PRESS)}
                >
                  <ArrowClockwiseIcon
                    aria-hidden="true"
                    weight="bold"
                    data-icon="inline-start"
                    className={cn(rereading && "animate-spin motion-reduce:animate-none")}
                  />
                  Check again
                </Button>
              </div>
              <SaveButtons view={view} logLabel="booking lookup" />
              <NeedAChange code={view.storedCode} />
            </ReceiptCard>
          </div>
        </div>
      ) : !shown.ok ? (
        <div key={arrival} data-lookup-result="">
          <Notice
            kind={shown.error.kind as keyof typeof NOTICE}
            message={shown.error.message}
            headingRef={heading}
            code={heldCode}
            onTryAgain={
              shown.error.kind === "failed" && heldCode ? () => find(heldCode) : undefined
            }
            pending={pending}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Need a change? (AC-3): the two ways to reach the desk, the text prefilled with the code. */
function NeedAChange({ code }: { code: string }) {
  return (
    <section className="border-border flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-label">Need a change?</h3>
        <p className="text-caption text-muted-foreground">
          Message us with your code and we&apos;ll sort it out.
        </p>
      </div>
      <ChannelButtons body={bookingCodeSmsBody(code)} />
    </section>
  );
}

/** Every answer that is not a receipt (AC-8, AC-9, AC-10, AC-13), with the ways to reach us. */
function Notice({
  kind,
  message,
  headingRef,
  code,
  onTryAgain,
  pending,
}: {
  kind: keyof typeof NOTICE;
  message: string;
  headingRef: React.Ref<HTMLHeadingElement>;
  code: string | null;
  onTryAgain?: () => void;
  pending: boolean;
}) {
  const notice = NOTICE[kind];
  // An unknown code is not worth prefilling: it may be the typo.
  const body = code && kind !== "not_found" ? bookingCodeSmsBody(code) : undefined;
  return (
    <section className="bg-card ring-border flex flex-col items-start gap-4 rounded-3xl p-6 shadow-sm ring-1">
      <span className="bg-state-unavailable text-state-unavailable-fg grid size-11 place-items-center rounded-2xl">
        <notice.icon aria-hidden="true" weight="bold" className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-title rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {notice.title}
        </h2>
        <p className="text-body text-muted-foreground text-pretty">{message}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {onTryAgain ? (
          <Button
            type="button"
            onClick={onTryAgain}
            disabled={pending}
            aria-busy={pending}
            className={cn("bg-mark text-mark-foreground hover:bg-mark/90 h-11 px-4", PRESS)}
          >
            <ArrowClockwiseIcon
              aria-hidden="true"
              weight="bold"
              data-icon="inline-start"
              className={cn(pending && "animate-spin motion-reduce:animate-none")}
            />
            Try again
          </Button>
        ) : null}
        <ChannelButtons body={body} />
      </div>
    </section>
  );
}

/** Before any lookup: where the code is, and what to do without it. */
function WhereIsMyCode() {
  return (
    <section className="ring-border flex flex-col gap-3 rounded-3xl p-6 ring-1">
      <h2 className="text-label">Where&apos;s my code?</h2>
      <p className="text-body text-muted-foreground text-pretty">
        It&apos;s on the receipt you saw after paying, and on the image or PDF you saved from it.
        Lost it? Message us and we&apos;ll find your booking for you.
      </p>
      <ChannelButtons />
    </section>
  );
}
