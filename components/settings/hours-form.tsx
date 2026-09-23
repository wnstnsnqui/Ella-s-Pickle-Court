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
import { Switch } from "@/components/ui/switch";
import { SLOT_MINUTES } from "@/lib/schedule/constants";
import type { VenueSettings } from "@/lib/schedule/grid";
import { formatSlotLabel } from "@/lib/time";

import {
  CLOSE_TIME_OPTIONS,
  commonOpenPair,
  DAY_NAMES,
  DAY_ORDER,
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

const HOURS_FIELDS = ["days", "slotMinutes", "bookingHorizonDays"] as const;

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
  const weekError = (form.formState.errors.days as { message?: string } | undefined)?.message;

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
          <fieldset className="flex flex-col gap-4">
            <legend className="text-label mb-3">The week</legend>
            {DAY_ORDER.map((dayOfWeek) => (
              <DayRow key={dayOfWeek} form={form} dayOfWeek={dayOfWeek} />
            ))}
            {/* The whole week refused at the boundary, which the per day rules
                below should have caught first. Shown rather than swallowed. */}
            {weekError ? (
              <p role="alert" className="text-destructive text-body">
                {weekError}
              </p>
            ) : null}
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

/**
 * One day of the week. Spec 0007, AC-8.
 *
 * Closed on disables the two selects and clears them, which is exactly what a
 * closed day is in the database: both times null. Closed off puts the venue's
 * most common pair back, so a reopened day is never a blank row to fill in.
 */
function DayRow({ form, dayOfWeek }: { form: UseFormReturn<HoursFormValues>; dayOfWeek: number }) {
  const index = form.getValues("days").findIndex((day) => day.dayOfWeek === dayOfWeek);
  const name = DAY_NAMES[dayOfWeek];
  const closed = form.watch(`days.${index}.closed`);

  const toggle = (value: boolean) => {
    form.setValue(`days.${index}.closed`, value, { shouldDirty: true });
    if (value) {
      form.setValue(`days.${index}.open`, "", { shouldDirty: true });
      form.setValue(`days.${index}.close`, "", { shouldDirty: true });
      form.clearErrors([`days.${index}.open`, `days.${index}.close`]);
      return;
    }
    const pair = commonOpenPair(form.getValues("days"));
    form.setValue(`days.${index}.open`, pair.open, { shouldDirty: true });
    form.setValue(`days.${index}.close`, pair.close, { shouldDirty: true });
  };

  return (
    <div className="border-border grid items-end gap-4 border-b pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[8rem_1fr_1fr_auto]">
      <p className="text-label sm:pb-2.5">{name}</p>

      <TimeField
        form={form}
        name={`days.${index}.open`}
        label="Opens"
        options={OPEN_TIME_OPTIONS}
        disabled={closed}
        describedBy={name}
      />
      <TimeField
        form={form}
        name={`days.${index}.close`}
        label="Closes"
        options={CLOSE_TIME_OPTIONS}
        disabled={closed}
        describedBy={name}
      />

      <div className="flex items-center gap-2 sm:pb-2.5">
        <Switch
          id={`closed-${dayOfWeek}`}
          checked={closed}
          onCheckedChange={toggle}
          aria-label={`${name} closed all day`}
        />
        <label htmlFor={`closed-${dayOfWeek}`} className="text-body">
          Closed
        </label>
      </div>
    </div>
  );
}

function TimeField({
  form,
  name,
  label,
  options,
  disabled,
  describedBy,
}: {
  form: UseFormReturn<HoursFormValues>;
  name: `days.${number}.open` | `days.${number}.close`;
  label: string;
  options: readonly string[];
  disabled: boolean;
  describedBy: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
            <FormControl>
              <SelectTrigger
                className="w-full tabular-nums"
                aria-label={`${describedBy} ${label.toLowerCase()}`}
              >
                <SelectValue placeholder={disabled ? "Closed" : "Pick a time"} />
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
