"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EndOption } from "@/lib/schedule/closure";
import type { StaffReservation } from "@/lib/schedule/queries";
import { formatSlotLabel, localEndTimeInZone } from "@/lib/time";

import { BoardSheet } from "@/components/board-sheet";
import { applyIssues, BookingFields } from "./booking-fields";
import {
  bookFormSchema,
  closeEditFormSchema,
  type BookFormValues,
  type CloseEditFormValues,
} from "./forms";

/** What an edit hands back: nothing, per field issues, or "the row moved, look again". */
export type EditOutcome = { issues?: Record<string, string[]>; stale?: boolean } | void;

export type EditPatch =
  { kind: "booking"; values: BookFormValues } | { kind: "closed"; values: CloseEditFormValues };

/**
 * Fix a row without cancelling it. Spec 0005, AC-8.
 *
 * A booking edit changes the five detail fields. A closure edit changes its
 * note and its end. When the row changed under the editor, the sheet keeps
 * what was typed, shows the fresh value under each field that differs, and
 * the next save goes against the new version because the board always sends
 * the version of the row it holds now.
 */
export function EditSheet({
  open,
  onOpenChange,
  reservation,
  timeZone,
  endOptions,
  pending,
  onSubmit,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: StaffReservation | null;
  timeZone: string;
  endOptions: readonly EndOption[];
  pending: boolean;
  onSubmit: (patch: EditPatch) => Promise<EditOutcome>;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}) {
  const [stale, setStale] = useState(false);
  // Closing the sheet forgets the stale notice. Adjusted during render rather
  // than in an effect, so a reopened sheet never paints the old notice once.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setStale(false);
  }

  if (!reservation) return null;
  const booking = reservation.kind === "booking";

  return (
    <BoardSheet
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      focusOnOpen={false}
      title={booking ? "Edit booking" : "Edit closure"}
      description={
        booking
          ? "Change the details. To move the hours, cancel and book again."
          : "Change the note, or where the closure ends."
      }
      footer={
        <Button type="submit" form="edit-form" disabled={pending} className="w-full">
          {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
          {pending ? "Saving" : stale ? "Save over the new version" : "Save"}
        </Button>
      }
    >
      {stale ? (
        <Alert className="mb-4">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>This changed while you were editing</AlertTitle>
          <AlertDescription>
            The fresh values are shown under each field. Yours are still in the boxes.
          </AlertDescription>
        </Alert>
      ) : null}
      {booking ? (
        <BookingEditForm
          key={reservation.id}
          reservation={reservation}
          stale={stale}
          onSubmit={async (values) => {
            const outcome = await onSubmit({ kind: "booking", values });
            if (outcome?.stale) setStale(true);
            return outcome;
          }}
        />
      ) : (
        <ClosureEditForm
          key={reservation.id}
          reservation={reservation}
          stale={stale}
          timeZone={timeZone}
          endOptions={endOptions}
          onSubmit={async (values) => {
            const outcome = await onSubmit({ kind: "closed", values });
            if (outcome?.stale) setStale(true);
            return outcome;
          }}
        />
      )}
    </BoardSheet>
  );
}

function toBookValues(row: StaffReservation): BookFormValues {
  return {
    customerName: row.customerName ?? "",
    customerPhone: row.customerPhone ?? "",
    note: row.note ?? "",
    paymentStatus: row.paymentStatus,
    amount: row.amount === null ? "" : String(row.amount),
  };
}

function BookingEditForm({
  reservation,
  stale,
  onSubmit,
}: {
  reservation: StaffReservation;
  stale: boolean;
  onSubmit: (values: BookFormValues) => Promise<EditOutcome>;
}) {
  const form = useForm<BookFormValues>({
    resolver: zodResolver(bookFormSchema),
    defaultValues: toBookValues(reservation),
  });
  return (
    <Form {...form}>
      <form
        id="edit-form"
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
        <BookingFields form={form} fresh={stale ? toBookValues(reservation) : null} />
      </form>
    </Form>
  );
}

function ClosureEditForm({
  reservation,
  stale,
  timeZone,
  endOptions,
  onSubmit,
}: {
  reservation: StaffReservation;
  stale: boolean;
  timeZone: string;
  endOptions: readonly EndOption[];
  onSubmit: (values: CloseEditFormValues) => Promise<EditOutcome>;
}) {
  const currentEnd = localEndTimeInZone(reservation.endsAt, timeZone);
  const form = useForm<CloseEditFormValues>({
    resolver: zodResolver(closeEditFormSchema),
    defaultValues: { note: reservation.note ?? "", endTime: currentEnd },
  });
  // The stored end may sit outside the free run (the hours were changed under
  // it); it still has to be pickable so the form can be saved untouched.
  const options = endOptions.some((option) => option.time === currentEnd)
    ? endOptions
    : [{ time: currentEnd, endsAt: reservation.endsAt }, ...endOptions];

  return (
    <Form {...form}>
      <form
        id="edit-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(async (values) => {
          const outcome = await onSubmit(values);
          if (outcome?.issues) applyIssues(form, outcome.issues, ["note", "endTime"]);
        })}
      >
        <FormField
          control={form.control}
          name="endTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ends at</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.endsAt} value={option.time}>
                      {formatSlotLabel(option.time)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {stale && currentEnd !== form.getValues("endTime") ? (
                <FormDescription>Now: {formatSlotLabel(currentEnd)}</FormDescription>
              ) : null}
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
                <Textarea {...field} placeholder="Optional" maxLength={200} />
              </FormControl>
              {stale && (reservation.note ?? "") !== form.getValues("note") ? (
                <FormDescription>Now: {reservation.note ?? "blank"}</FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
