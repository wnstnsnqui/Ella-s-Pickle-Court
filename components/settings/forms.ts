import { z } from "zod";

import { SLOT_MINUTES } from "@/lib/schedule/constants";
import type { VenueSettings } from "@/lib/schedule/grid";
import {
  closeTimeSchema,
  courtNameSchema,
  courtNoteSchema,
  localTimeSchema,
} from "@/lib/schedule/schemas";
import { minutesToTime } from "@/lib/time";

/**
 * What the settings page collects, as typed. Spec 0007, AC-3, AC-4 and AC-8.
 *
 * The field rules are the ones the Server Actions enforce, imported rather
 * than copied, so a form can never accept what the boundary refuses. The two
 * differences are about controls: a `Select` holds a string, so the slot
 * length is one here and a number on the wire, and the horizon is typed as
 * text because that is what a number input holds.
 */

export const courtFormSchema = z.object({
  name: courtNameSchema,
  note: courtNoteSchema,
});

export type CourtFormValues = z.infer<typeof courtFormSchema>;

export const EMPTY_COURT_FORM: CourtFormValues = { name: "", note: "" };

const slotMinutesText = z.enum(SLOT_MINUTES.map(String) as [string, ...string[]]);

const horizonText = z
  .string()
  .trim()
  .regex(/^\d+$/, "Enter a whole number of days.")
  .refine((value) => Number(value) >= 1 && Number(value) <= 365, "Between 1 and 365 days.");

export const hoursFormSchema = z
  .object({
    weekdayOpen: localTimeSchema,
    weekdayClose: closeTimeSchema,
    weekendOpen: localTimeSchema,
    weekendClose: closeTimeSchema,
    slotMinutes: slotMinutesText,
    bookingHorizonDays: horizonText,
  })
  .superRefine((value, ctx) => {
    // The same rule the action and the database check: a close after its open.
    if (value.weekdayClose <= value.weekdayOpen) {
      ctx.addIssue({
        code: "custom",
        path: ["weekdayClose"],
        message: "Closing has to come after opening.",
      });
    }
    if (value.weekendClose <= value.weekendOpen) {
      ctx.addIssue({
        code: "custom",
        path: ["weekendClose"],
        message: "Closing has to come after opening.",
      });
    }
  });

export type HoursFormValues = z.infer<typeof hoursFormSchema>;

/** The loaded settings as the form holds them. */
export function toHoursValues(settings: VenueSettings): HoursFormValues {
  return {
    weekdayOpen: settings.weekdayOpen,
    weekdayClose: settings.weekdayClose,
    weekendOpen: settings.weekendOpen,
    weekendClose: settings.weekendClose,
    slotMinutes: String(settings.slotMinutes),
    bookingHorizonDays: String(settings.bookingHorizonDays),
  };
}

/** The form's values as `saveVenueSettings` wants them. */
export function toHoursInput(values: HoursFormValues, version: number, acknowledge?: boolean) {
  return {
    version,
    weekdayOpen: values.weekdayOpen,
    weekdayClose: values.weekdayClose,
    weekendOpen: values.weekendOpen,
    weekendClose: values.weekendClose,
    slotMinutes: Number(values.slotMinutes),
    bookingHorizonDays: Number(values.bookingHorizonDays),
    acknowledge,
  };
}

/** Every half hour from `00:00` to `23:30`: where a day may start. */
export const OPEN_TIME_OPTIONS: readonly string[] = Array.from({ length: 48 }, (_, index) =>
  minutesToTime(index * 30),
);

/** Every half hour from `00:30` to `24:00`: where a day may end. */
export const CLOSE_TIME_OPTIONS: readonly string[] = [
  ...Array.from({ length: 47 }, (_, index) => minutesToTime((index + 1) * 30)),
  "24:00",
];
