"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/actions";
import {
  cancelOnlineBooking,
  confirmOnlineBooking,
  loadStaffBooking,
  rejectOnlineBooking,
  settleOnlineRefund,
} from "@/lib/online-checks/actions";
import type { DecisionResult, StaffBooking } from "@/lib/online-checks/types";

/**
 * One online booking in a sheet, and the decisions on it. Spec 0016, AC-6 to
 * AC-14.
 *
 * Read when the sheet opens and again whenever `changeKey` moves (the row
 * changed, or a live read landed), so a decision made on another board shows
 * here without a reload. While a newer answer is on its way, a loaded
 * booking stays on screen rather than flashing back to loading.
 *
 * Confirm sends the version this sheet last read; a step sends the version it
 * was opened on, whatever a live read brought in meanwhile. A `stale` or
 * `wrong_state` answer writes nothing; the sheet says so and reads the booking
 * again (AC-14). One call at a time: `pending` disables every button.
 */

export type BookingLoad =
  | { state: "loading" }
  | { state: "loaded"; booking: StaffBooking }
  | { state: "failed"; message: string };

export type Step =
  { kind: "turn_down" } | { kind: "cancel" } | { kind: "refund"; outcome: "refunded" | "not_owed" };

/** What a step form gets back: field issues to show, or nothing. */
export type StepOutcome = { issues: Record<string, string[]> } | undefined;

export type EndValues = {
  reason: string;
  note: string;
  refundOwed: boolean;
};

export type SettleValues = { amount?: number; note: string };

export function useOnlineBooking({
  bookingId,
  changeKey,
  onDecided,
  onBusy,
}: {
  bookingId: number;
  changeKey: string;
  /** After a decision landed: the board refetches, and a cell sheet may close. */
  onDecided: (kind: "confirmed" | "rejected" | "cancelled" | "settled") => void;
  /** True while a decision is in flight, so the board does not mistake its own write for somebody else's. */
  onBusy?: (busy: boolean) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{ key: string; load: BookingLoad } | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const key = `${changeKey}:${attempt}`;

  useEffect(() => {
    let live = true;
    loadStaffBooking({ bookingId })
      .then((result) => {
        if (!live) return;
        setAnswer({
          key,
          load: result.ok
            ? { state: "loaded", booking: result.data }
            : { state: "failed", message: result.error.message },
        });
      })
      .catch(() => {
        if (live) {
          setAnswer({
            key,
            load: { state: "failed", message: "The online booking did not load." },
          });
        }
      });
    return () => {
      live = false;
    };
  }, [bookingId, key]);

  const load: BookingLoad =
    answer && (answer.key === key || answer.load.state === "loaded")
      ? answer.load
      : { state: "loading" };

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const booking = load.state === "loaded" ? load.booking : null;

  // A step keeps the version it was opened on. A live read can land while the
  // manager fills it in, and sending that newer version would decide on a
  // state they never saw (AC-14).
  const [stepVersion, setStepVersion] = useState<number | null>(null);
  const openStep = useCallback(
    (next: Step | null) => {
      setStep(next);
      setStepVersion(next && booking ? booking.version : null);
    },
    [booking],
  );

  /** Send one decision and make sense of its answer. */
  const decide = useCallback(
    async (
      send: () => Promise<ActionResult<DecisionResult>>,
      kind: "confirmed" | "rejected" | "cancelled" | "settled",
      success: string,
    ): Promise<StepOutcome> => {
      setPending(true);
      setNotice(null);
      onBusy?.(true);
      let result: ActionResult<DecisionResult>;
      try {
        result = await send();
      } catch {
        setPending(false);
        onBusy?.(false);
        toast.error("The change did not go through. Check the connection.");
        return;
      }
      setPending(false);
      if (result.ok) {
        setStep(null);
        reload();
        toast.success(success);
        onDecided(kind);
        onBusy?.(false);
        return;
      }
      onBusy?.(false);
      const { error } = result;
      if (error.kind === "conflict") {
        // Somebody got there first: say so, and show where it stands now.
        setStep(null);
        setNotice(error.message);
        reload();
        return;
      }
      if (error.kind === "invalid" && Object.keys(error.issues).length > 0) {
        return { issues: error.issues };
      }
      if (error.kind === "forbidden") {
        setStep(null);
        setNotice(error.message);
        return;
      }
      toast.error(error.message);
    },
    [onDecided, onBusy, reload],
  );

  const confirm = useCallback(async () => {
    if (!booking) return;
    await decide(
      () => confirmOnlineBooking({ bookingId: booking.id, version: booking.version }),
      "confirmed",
      "Payment confirmed.",
    );
  }, [booking, decide]);

  const end = useCallback(
    async (kind: "turn_down" | "cancel", values: EndValues): Promise<StepOutcome> => {
      if (!booking) return;
      const input = {
        bookingId: booking.id,
        version: stepVersion ?? booking.version,
        reason: values.reason,
        note: values.note,
        refundOwed: values.refundOwed,
      };
      return kind === "turn_down"
        ? decide(
            () => rejectOnlineBooking(input),
            "rejected",
            "Payment turned down. The hours are free again.",
          )
        : decide(
            () => cancelOnlineBooking(input),
            "cancelled",
            "Booking cancelled. The hours are free again.",
          );
    },
    [booking, decide, stepVersion],
  );

  const settle = useCallback(
    async (outcome: "refunded" | "not_owed", values: SettleValues): Promise<StepOutcome> => {
      if (!booking) return;
      const version = stepVersion ?? booking.version;
      return decide(
        () =>
          settleOnlineRefund(
            outcome === "refunded"
              ? {
                  bookingId: booking.id,
                  version,
                  outcome,
                  amount: values.amount,
                  note: values.note,
                }
              : { bookingId: booking.id, version, outcome, note: values.note },
          ),
        "settled",
        outcome === "refunded" ? "Refund recorded." : "Marked no refund needed.",
      );
    },
    [booking, decide, stepVersion],
  );

  return { load, reload, step, setStep: openStep, pending, notice, confirm, end, settle };
}

export type OnlineBookingController = ReturnType<typeof useOnlineBooking>;
