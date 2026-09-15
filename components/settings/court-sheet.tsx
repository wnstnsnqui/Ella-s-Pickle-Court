"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useForm } from "react-hook-form";

import { BoardSheet } from "@/components/staff/board-sheet";
import { applyIssues } from "@/components/staff/booking-fields";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OwnerCourt } from "@/lib/schedule/queries";

import { courtFormSchema, EMPTY_COURT_FORM, type CourtFormValues } from "./forms";

/** What a save hands back: nothing, or per field issues to show in place. */
export type CourtSheetOutcome = { issues?: Record<string, string[]> } | void;

/**
 * Add a court, or rename one. Spec 0007, AC-3 and AC-4.
 *
 * One sheet for both: empty for a new court, prefilled for an edit. A name
 * clash comes back as an issue on the name field, so the sheet stays open with
 * the typed name. When the court changed under the editor the page reloads the
 * fresh values into it (the form is keyed on the version) and says so; the
 * next save goes against the new version.
 */
export function CourtSheet({
  open,
  onOpenChange,
  court,
  stale,
  pending,
  onSubmit,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The court being edited, or null for a new one. */
  court: OwnerCourt | null;
  /** The row changed while the sheet was open; the fresh values are loaded. */
  stale: boolean;
  pending: boolean;
  onSubmit: (values: CourtFormValues) => Promise<CourtSheetOutcome>;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}) {
  const editing = court !== null;
  return (
    <BoardSheet
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={editing ? "Edit court" : "Add a court"}
      description={
        editing
          ? "Change the name or the note. To move it, use the arrows on the list."
          : "It appears as the last column on both boards straight away."
      }
      footer={
        <Button type="submit" form="court-form" disabled={pending} className="w-full">
          {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
          {pending ? "Saving" : editing ? "Save" : "Add court"}
        </Button>
      }
    >
      {stale ? (
        <Alert className="mb-4">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>This court changed while you were editing</AlertTitle>
          <AlertDescription>
            The fresh values are loaded below. Check them, then save again.
          </AlertDescription>
        </Alert>
      ) : null}
      <CourtForm
        key={court ? `${court.id}:${court.version}` : "new"}
        court={court}
        onSubmit={onSubmit}
      />
    </BoardSheet>
  );
}

function CourtForm({
  court,
  onSubmit,
}: {
  court: OwnerCourt | null;
  onSubmit: (values: CourtFormValues) => Promise<CourtSheetOutcome>;
}) {
  const form = useForm<CourtFormValues>({
    resolver: zodResolver(courtFormSchema),
    defaultValues: court ? { name: court.name, note: court.note ?? "" } : EMPTY_COURT_FORM,
  });

  return (
    <Form {...form}>
      <form
        id="court-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(async (values) => {
          const outcome = await onSubmit(values);
          if (outcome?.issues) applyIssues(form, outcome.issues, ["name", "note"]);
        })}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="off"
                  autoFocus
                  placeholder="Court 3"
                  maxLength={40}
                />
              </FormControl>
              <FormDescription>
                Up to 40 characters. No two live courts share a name.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Optional. Covered, near the entrance…"
                  maxLength={200}
                />
              </FormControl>
              <FormDescription>For the desk. Where it is, what makes it different.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
