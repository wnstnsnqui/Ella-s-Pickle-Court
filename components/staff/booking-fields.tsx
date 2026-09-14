"use client";

import type { UseFormReturn } from "react-hook-form";

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_STATUSES } from "@/lib/schedule/constants";

import { PAYMENT_LABEL } from "./format";
import type { BookFormValues } from "./forms";

/**
 * The five customer fields, shared by Book and by Edit. Spec 0005, AC-4 and AC-8.
 *
 * `fresh` is only set while an edit is stale: it carries the values the row has
 * now, and any field whose fresh value differs from what is typed shows it
 * underneath, so the person can compare before saving over it.
 */
export type FieldIssues = Partial<Record<keyof BookFormValues, string[]>>;

export function BookingFields({
  form,
  fresh,
  autoFocusName = false,
}: {
  form: UseFormReturn<BookFormValues>;
  fresh?: BookFormValues | null;
  autoFocusName?: boolean;
}) {
  const now = (field: keyof BookFormValues, label?: (value: string) => string) => {
    if (!fresh) return null;
    const typed = form.getValues(field);
    if (fresh[field] === typed) return null;
    const shown = fresh[field] === "" ? "blank" : label ? label(fresh[field]) : fresh[field];
    return <FormDescription>Now: {shown}</FormDescription>;
  };

  return (
    <div className="flex flex-col gap-4">
      <FormField
        control={form.control}
        name="customerName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Customer name</FormLabel>
            <FormControl>
              <Input
                {...field}
                autoComplete="off"
                autoFocus={autoFocusName}
                placeholder="Who is playing"
                maxLength={80}
              />
            </FormControl>
            {now("customerName")}
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="customerPhone"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Phone</FormLabel>
            <FormControl>
              <Input
                {...field}
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="Optional"
                maxLength={30}
              />
            </FormControl>
            {now("customerPhone")}
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="paymentStatus"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {PAYMENT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {PAYMENT_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {now(
                "paymentStatus",
                (value) => PAYMENT_LABEL[value as BookFormValues["paymentStatus"]],
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount (₱)</FormLabel>
              <FormControl>
                <Input {...field} inputMode="decimal" placeholder="Optional" />
              </FormControl>
              {now("amount")}
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="note"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Note</FormLabel>
            <FormControl>
              <Textarea {...field} placeholder="Optional, up to 200 characters" maxLength={200} />
            </FormControl>
            {now("note")}
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

/** Put the action's per field issues on the form, so they read beside the field. */
export function applyIssues<T extends Record<string, unknown>>(
  form: UseFormReturn<T>,
  issues: Record<string, string[]>,
  fields: readonly (keyof T & string)[],
) {
  for (const field of fields) {
    const messages = issues[field];
    if (messages?.length) {
      form.setError(field as Parameters<typeof form.setError>[0], { message: messages[0] });
    }
  }
}
