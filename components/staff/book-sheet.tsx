"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { describeSummary, summarizeRuns, type SelectionRun } from "@/lib/schedule/selection";

import { BoardSheet } from "./board-sheet";
import { applyIssues, BookingFields } from "./booking-fields";
import { bookFormSchema, EMPTY_BOOK_FORM, type BookFormValues } from "./forms";

/** What a submit hands back: nothing on success, per field issues on a refusal. */
export type SubmitOutcome = { issues?: Record<string, string[]> } | void;

/**
 * Take a booking for the selection. Spec 0005, AC-4 and AC-6.
 *
 * The form keeps its values across a refusal: when a slot was taken, the
 * survivors stay selected, the sheet stays open, and Book again writes what is
 * left with the same name.
 */
export function BookSheet({
  open,
  onOpenChange,
  runs,
  pending,
  onSubmit,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runs: readonly SelectionRun[];
  pending: boolean;
  onSubmit: (values: BookFormValues) => Promise<SubmitOutcome>;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}) {
  const form = useForm<BookFormValues>({
    resolver: zodResolver(bookFormSchema),
    defaultValues: EMPTY_BOOK_FORM,
  });

  // A fresh sheet is a fresh form. The values only survive while it stays open.
  useEffect(() => {
    if (!open) form.reset(EMPTY_BOOK_FORM);
  }, [open, form]);

  const summary = describeSummary(summarizeRuns(runs));

  return (
    <BoardSheet
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title="Book"
      description={`${summary}. One booking per run, all under the same name.`}
      footer={
        <Button type="submit" form="book-form" disabled={pending} className="w-full">
          {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
          {pending ? "Saving" : `Book ${summary}`}
        </Button>
      }
    >
      <Form {...form}>
        <form
          id="book-form"
          noValidate
          onSubmit={form.handleSubmit(async (values) => {
            const outcome = await onSubmit(values);
            if (outcome?.issues) {
              applyIssues(form, outcome.issues, [
                "customerName",
                "customerPhone",
                "note",
                "paymentStatus",
                "amount",
              ]);
            }
          })}
        >
          <BookingFields form={form} autoFocusName />
        </form>
      </Form>
    </BoardSheet>
  );
}
