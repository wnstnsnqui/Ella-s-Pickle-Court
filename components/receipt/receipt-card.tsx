"use client";

import {
  ArrowSquareOutIcon,
  CheckIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FilePdfIcon,
  ProhibitIcon,
  SpinnerIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type Ref } from "react";

import { Fact, SelectedCourts } from "@/components/landing/checkout-selection";
import { PRESS } from "@/components/landing/press";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VENUE_ADDRESS, VENUE_NAME, VENUE_PHONE_DISPLAY } from "@/lib/venue";

import { receiptImageModel, renderReceiptImage, saveReceiptImage } from "./receipt-image";
import type { ReceiptFact, ReceiptView } from "./receipt-view";

/**
 * The receipt, as both the checkout's last step and `/booking` show it (spec
 * 0015, AC-14; spec 0017, AC-3 to AC-7). One `ReceiptView` in, so the screen,
 * the print and the saved image agree. `data-receipt` is what the print
 * stylesheet in `app/globals.css` keeps: on paper only this card prints.
 */

/** The badge's look: teal with a check while the booking stands; quiet grey once it does not. */
const BADGE: Record<ReceiptView["status"], { className: string; icon: typeof CheckIcon }> = {
  confirmed: {
    className: "bg-state-available text-state-available-fg border-state-available-border",
    icon: CheckIcon,
  },
  cancelled: {
    className: "bg-state-unavailable text-state-unavailable-fg border-state-unavailable-border",
    icon: XIcon,
  },
  not_booked: {
    className: "bg-state-unavailable text-state-unavailable-fg border-state-unavailable-border",
    icon: ProhibitIcon,
  },
};

/** The venue, at the top of the printed page only (AC-14). */
function PrintVenue() {
  return (
    <div className="border-border hidden flex-col items-center gap-0.5 border-b pb-4 text-center print:flex">
      <p className="text-title">{VENUE_NAME}</p>
      <p className="text-caption text-muted-foreground">
        {VENUE_ADDRESS} · {VENUE_PHONE_DISPLAY}
      </p>
    </div>
  );
}

/**
 * Status first (AC-3): the large badge with its icon and word, the title, and
 * the lines under it. The lookup moves focus here when a result appears. The
 * checkout's dialog already says "Booking confirmed" above the card, so there
 * this shows on paper only.
 */
function StatusBlock({
  view,
  headingRef,
  printOnly,
}: {
  view: ReceiptView;
  headingRef?: Ref<HTMLHeadingElement>;
  printOnly: boolean;
}) {
  const badge = BADGE[view.status];
  if (printOnly) {
    // The dialog's own title is the heading on screen, and the chip by the
    // total carries the word, so paper needs only the icon and the title.
    return (
      <div aria-hidden="true" className="hidden items-center justify-center gap-2 print:flex">
        <badge.icon weight="bold" className="size-6" />
        <p className="text-title">{view.title}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span
        className={cn(
          "text-title inline-flex items-center gap-2 rounded-full border-2 py-2 pr-5 pl-3 print:border",
          badge.className,
        )}
      >
        <span className="bg-background/60 grid size-8 place-items-center rounded-full">
          <badge.icon aria-hidden="true" weight="bold" className="size-5" />
        </span>
        {view.word}
      </span>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-title rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {view.title}
      </h2>
      {view.lines.map((line) => (
        <p key={line} className="text-body text-muted-foreground max-w-[40ch] text-pretty">
          {line}
        </p>
      ))}
    </div>
  );
}

function CodeBlock({ code, logLabel }: { code: string; logLabel: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      console.warn(`${logLabel}: the code could not be copied`);
    }
  }

  return (
    <div className="bg-muted print:ring-border flex flex-col items-center gap-2 rounded-2xl p-4 text-center print:ring-1">
      <p className="text-caption text-muted-foreground">Your booking code</p>
      <p className="text-display tracking-wider tabular-nums">{code}</p>
      <Button
        type="button"
        variant="outline"
        onClick={copy}
        className={cn("h-11 px-4 print:hidden", PRESS)}
      >
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
  );
}

/** A small caps label over its facts, one section of the shared card. */
function FactGroup({ title, facts }: { title: string; facts: readonly ReceiptFact[] }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1.5 px-4 py-3">
      <h3 className="text-caption text-muted-foreground font-medium tracking-wider uppercase">
        {title}
      </h3>
      <dl className="flex flex-col gap-1.5">
        {facts.map((fact) => (
          <Fact key={fact.term} term={fact.term}>
            {fact.value}
          </Fact>
        ))}
      </dl>
    </section>
  );
}

export function ReceiptCard({
  view,
  headingRef,
  children,
}: {
  view: ReceiptView;
  /** The lookup's status heading, which takes focus when a result appears (AC-3). */
  headingRef?: Ref<HTMLHeadingElement>;
  /** The actions under the receipt. Never printed. */
  children?: React.ReactNode;
}) {
  const checkout = view.source === "checkout";
  const badge = BADGE[view.status];
  return (
    <article data-receipt="" aria-label="Receipt" className="flex flex-col gap-3">
      <PrintVenue />
      <StatusBlock view={view} headingRef={headingRef} printOnly={checkout} />
      <CodeBlock code={view.code} logLabel={checkout ? "checkout" : "booking lookup"} />

      <SelectedCourts
        heading={view.heading}
        courts={view.courts}
        runs={view.runs}
        amount={view.amount}
      />

      {/* Customer and Payment share one card, so the receipt fits a phone with less scrolling. */}
      <div className="ring-border divide-border text-body flex flex-col divide-y rounded-2xl ring-1">
        {view.customer.length > 0 ? <FactGroup title="Customer" facts={view.customer} /> : null}
        <FactGroup title="Payment" facts={view.payment} />
      </div>

      <div className="ring-border flex items-center justify-between gap-4 rounded-2xl px-4 py-3 ring-1">
        <div className="flex flex-col">
          <span className="text-caption text-muted-foreground">{view.totalLabel}</span>
          <span className="text-title tabular-nums">{view.total}</span>
        </div>
        {checkout ? (
          <span
            className={cn(
              "text-label inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
              badge.className,
            )}
          >
            <badge.icon aria-hidden="true" weight="bold" />
            {view.word}
          </span>
        ) : null}
      </div>

      {checkout
        ? view.lines.map((line) => (
            <p key={line} className="text-caption text-muted-foreground text-center">
              {line}
            </p>
          ))
        : null}

      {children ? <div className="flex flex-col gap-2 print:hidden">{children}</div> : null}
    </article>
  );
}

/**
 * Save as image and Save as PDF (spec 0015, AC-14; spec 0017, AC-14, AC-15).
 * The image is drawn as the receipt appears, not on the press: iOS refuses a
 * share sheet opened too long after the tap, and drawing waits on the font.
 * The PDF is the browser's own print dialog over the print stylesheet.
 */
export function SaveButtons({ view, logLabel }: { view: ReceiptView; logLabel: string }) {
  const model = useMemo(() => receiptImageModel(view), [view]);
  const [image, setImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    let live = true;
    renderReceiptImage(model).then(
      (file) => {
        if (live) setImage(file);
      },
      () => console.warn(`${logLabel}: the receipt image could not be drawn`),
    );
    return () => {
      live = false;
    };
  }, [model, logLabel]);

  async function save() {
    setSaving(true);
    setSaveFailed(false);
    try {
      await saveReceiptImage(image ?? (await renderReceiptImage(model)));
    } catch {
      console.warn(`${logLabel}: the receipt image could not be saved`);
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="grid w-full grid-cols-1 gap-2 min-[380px]:grid-cols-2">
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
        <Button
          type="button"
          variant="outline"
          onClick={() => window.print()}
          className={cn("h-11 w-full px-4", PRESS)}
        >
          <FilePdfIcon aria-hidden="true" weight="bold" data-icon="inline-start" />
          Save as PDF
        </Button>
      </div>
      <p aria-live="polite" className="text-caption text-muted-foreground text-center">
        {saveFailed ? "We couldn't save the image. Take a screenshot of this page instead." : ""}
      </p>
    </div>
  );
}

/**
 * "Track this booking" (spec 0017, AC-11, AC-16): `/booking` in a new tab, so
 * the receipt stays on screen to save. The code rides in the fragment, which
 * no request ever carries to a server; the page reads it once and clears it.
 */
export function TrackLink({ storedCode }: { storedCode: string }) {
  return (
    <Button asChild variant="ghost" className={cn("text-link h-11 w-full px-4", PRESS)}>
      <a href={`/booking#${storedCode}`} target="_blank" rel="noopener noreferrer">
        Track this booking
        <ArrowSquareOutIcon aria-hidden="true" weight="bold" data-icon="inline-end" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </Button>
  );
}
