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

/**
 * One day row. A closed day carries the toggle and two empty selects rather
 * than a third state, which is the same shape `venue_hours` stores (spec 0007,
 * AC-8). The times are strings because that is what a `Select` holds; empty
 * means nothing picked yet.
 */
const dayRowSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    closed: z.boolean(),
    open: z.union([localTimeSchema, z.literal("")]),
    close: z.union([closeTimeSchema, z.literal("")]),
  })
  .superRefine((value, ctx) => {
    if (value.closed) return;
    if (value.open === "") {
      ctx.addIssue({ code: "custom", path: ["open"], message: "Pick an opening time." });
    }
    if (value.close === "") {
      ctx.addIssue({ code: "custom", path: ["close"], message: "Pick a closing time." });
    }
    // The same rule the action and the database check: a close after its open.
    if (value.open !== "" && value.close !== "" && value.close <= value.open) {
      ctx.addIssue({
        code: "custom",
        path: ["close"],
        message: "Closing has to come after opening.",
      });
    }
  });

export const hoursFormSchema = z.object({
  /** Seven rows, ordered `0` (Sunday) to `6`, whatever order they render in. */
  days: z.array(dayRowSchema).length(7),
  slotMinutes: slotMinutesText,
  bookingHorizonDays: horizonText,
});

export type HoursFormValues = z.infer<typeof hoursFormSchema>;
export type DayRowValues = HoursFormValues["days"][number];

/** Monday first, which is how the week reads, over storage that starts at Sunday. */
export const DAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

export const DAY_NAMES: Readonly<Record<number, string>> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

/** The loaded settings as the form holds them. */
export function toHoursValues(settings: VenueSettings): HoursFormValues {
  const byDay = new Map(settings.days.map((day) => [day.dayOfWeek, day]));
  return {
    days: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => {
      const day = byDay.get(dayOfWeek);
      const closed = !day || day.open === null || day.close === null;
      return {
        dayOfWeek,
        closed,
        open: closed ? "" : (day?.open ?? ""),
        close: closed ? "" : (day?.close ?? ""),
      };
    }),
    slotMinutes: String(settings.slotMinutes),
    bookingHorizonDays: String(settings.bookingHorizonDays),
  };
}

/**
 * The pair a day reopens on, so Ella is never picking from a blank row (spec
 * 0007, AC-8): the venue's most common open pair across the other days, and
 * the usual `06:00` to `22:00` when every other day is closed too.
 */
export function commonOpenPair(days: readonly DayRowValues[]): { open: string; close: string } {
  const tally = new Map<string, number>();
  for (const day of days) {
    if (day.closed || day.open === "" || day.close === "") continue;
    const key = `${day.open}|${day.close}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of tally) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  if (best === null) return { open: "06:00", close: "22:00" };
  const [open, close] = best.split("|");
  return { open, close };
}

/** The form's values as `saveVenueSettings` wants them. */
export function toHoursInput(values: HoursFormValues, version: number, acknowledge?: boolean) {
  return {
    version,
    days: values.days.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      open: day.closed || day.open === "" ? null : day.open,
      close: day.closed || day.close === "" ? null : day.close,
    })),
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
