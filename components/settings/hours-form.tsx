"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Clock, LoaderCircle, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import { ConfirmDialog } from "@/components/staff/confirm-dialog";
import { applyIssues } from "@/components/staff/booking-fields";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SLOT_MINUTES } from "@/lib/schedule/constants";
import type { VenueSettings } from "@/lib/schedule/grid";
import { formatSlotLabel } from "@/lib/time";

import {
  CLOSE_TIME_OPTIONS,
  hoursFormSchema,
  OPEN_TIME_OPTIONS,
  toHoursValues,
  type HoursFormValues,
} from "./forms";
import { SettingsSection } from "./settings-section";

/**
 * What a save hands back: nothing, per field issues, or the number of future
 * bookings the new hours would strand, which the form turns into a question.
 */
export type HoursOutcome = { issues?: Record<string, string[]>; outsideCount?: number } | void;

const HOURS_FIELDS = [
  "weekdayOpen",
  "weekdayClose",
  "weekendOpen",
  "weekendClose",
  "slotMinutes",
  "bookingHorizonDays",
] as const;

/**
 * The opening hours, the slot length and the booking horizon. Spec 0007,
 * AC-8, AC-9 and AC-13.
 *
 * Save wakes only when a field differs from what was loaded, and the loaded
 * values are the settings row the page holds, so a refetch after a stale save
 * reloads the form (it is keyed on the version by the page). The two step
 * save lives here: a count comes back, the dialog asks, Save anyway resends
 * the same values with the acknowledgement.
 */
export function HoursForm({
  settings,
  pending,
  onSubmit,
}: {
  settings: VenueSettings;
  pending: boolean;
  onSubmit: (values: HoursFormValues, acknowledge: boolean) => Promise<HoursOutcome>;
}) {
  const form = useForm<HoursFormValues>({
    resolver: zodResolver(hoursFormSchema),
    defaultValues: toHoursValues(settings),
  });
  const [outside, setOutside] = useState<{ values: HoursFormValues; count: number } | null>(null);

  const submit = async (values: HoursFormValues, acknowledge: boolean) => {
    const outcome = await onSubmit(values, acknowledge);
    if (outcome?.issues) applyIssues(form, outcome.issues, HOURS_FIELDS);
    if (outcome?.outsideCount !== undefined) {
      setOutside({ values, count: outcome.outsideCount });
      return;
    }
    setOutside(null);
  };

  const { isDirty } = form.formState;

  return (
    <SettingsSection
      id="hours"
      icon={Clock}
      title="Opening hours"
      description="The rows on the grid, and how far ahead staff may book. Times are venue time, Asia/Manila."
    >
      <Form {...form}>
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={form.handleSubmit((values) => submit(values, false))}
        >
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="text-label mb-3">Weekdays</legend>
            <TimeField form={form} name="weekdayOpen" label="Opens" options={OPEN_TIME_OPTIONS} />
            <TimeField
              form={form}
              name="weekdayClose"
              label="Closes"
              options={CLOSE_TIME_OPTIONS}
            />
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="text-label mb-3">Weekends</legend>
            <TimeField form={form} name="weekendOpen" label="Opens" options={OPEN_TIME_OPTIONS} />
            <TimeField
              form={form}
              name="weekendClose"
              label="Closes"
              options={CLOSE_TIME_OPTIONS}
            />
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="slotMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slot length</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SLOT_MINUTES.map((minutes) => (
                        <SelectItem key={minutes} value={String(minutes)}>
                          {minutes} minutes
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>How long one row on the grid is.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="bookingHorizonDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Booking horizon</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <Input
                        {...field}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={365}
                        className="w-24 tabular-nums"
                      />
                      <span className="text-body text-muted-foreground">days ahead</span>
                    </div>
                  </FormControl>
                  <FormDescription>
                    How far into the future staff may book, 1 to 365.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="border-border flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            {isDirty ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => form.reset(toHoursValues(settings))}
              >
                <RotateCcw aria-hidden="true" />
                Undo changes
              </Button>
            ) : null}
            <Button type="submit" disabled={!isDirty || pending}>
              {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
              {pending ? "Saving" : "Save hours"}
            </Button>
          </div>
        </form>
      </Form>

      <ConfirmDialog
        open={outside !== null}
        onOpenChange={(open) => {
          if (!open) setOutside(null);
        }}
        title="Some bookings fall outside these hours"
        description={
          outside
            ? `${outside.count} future booking${outside.count === 1 ? "" : "s"} fall${outside.count === 1 ? "s" : ""} outside these hours. Save anyway?`
            : ""
        }
        keepLabel="Keep editing"
        confirmLabel="Save anyway"
        confirmVariant="default"
        pending={pending}
        onConfirm={() => {
          if (outside) void submit(outside.values, true);
        }}
      />
    </SettingsSection>
  );
}

function TimeField({
  form,
  name,
  label,
  options,
}: {
  form: UseFormReturn<HoursFormValues>;
  name: "weekdayOpen" | "weekdayClose" | "weekendOpen" | "weekendClose";
  label: string;
  options: readonly string[];
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger className="w-full tabular-nums">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((time) => (
                <SelectItem key={time} value={time} className="tabular-nums">
                  {formatSlotLabel(time)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
