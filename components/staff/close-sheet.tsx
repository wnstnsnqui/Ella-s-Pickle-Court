"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { describeSummary, summarizeRuns, type SelectionRun } from "@/lib/schedule/selection";

import { BoardSheet } from "@/components/board-sheet";
import { applyIssues } from "./booking-fields";
import type { SubmitOutcome } from "./book-sheet";
import { closeFormSchema, type CloseFormValues } from "./forms";

/**
 * Close a court for the selection. Spec 0005, AC-5.
 *
 * Shorter than Book on purpose: a closure needs no customer, only a word on
 * why, and even that is optional.
 */
export function CloseSheet({
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
  onSubmit: (values: CloseFormValues) => Promise<SubmitOutcome>;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}) {
  const form = useForm<CloseFormValues>({
    resolver: zodResolver(closeFormSchema),
    defaultValues: { note: "" },
  });

  useEffect(() => {
    if (!open) form.reset({ note: "" });
  }, [open, form]);

  const summary = describeSummary(summarizeRuns(runs));

  return (
    <BoardSheet
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title="Close court"
      description={`${summary}. Players will see these hours as Unavailable.`}
      footer={
        <Button type="submit" form="close-form" disabled={pending} className="w-full">
          {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
          {pending ? "Saving" : `Close ${summary}`}
        </Button>
      }
    >
      <Form {...form}>
        <form
          id="close-form"
          noValidate
          onSubmit={form.handleSubmit(async (values) => {
            const outcome = await onSubmit(values);
            if (outcome?.issues) applyIssues(form, outcome.issues, ["note"]);
          })}
        >
          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Note</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    autoFocus
                    placeholder="Optional: net down, a class, a repair"
                    maxLength={200}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </BoardSheet>
  );
}
