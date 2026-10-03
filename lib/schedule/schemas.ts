import { z } from "zod";

import {
  PAYMENT_STATUSES,
  RESERVATION_KINDS,
  RESERVATION_STATUSES,
  SLOT_MINUTES,
  STAFF_ROLES,
} from "./constants";

/**
 * Every Server Action boundary for spec 0002, validated before anything reaches
 * the database. The enums are built from `constants.ts`, so a value added there
 * appears here for free and the check constraints stay the one other copy.
 */

export const reservationKindSchema = z.enum(RESERVATION_KINDS);
export const reservationStatusSchema = z.enum(RESERVATION_STATUSES);
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export const staffRoleSchema = z.enum(STAFF_ROLES);
export const slotMinutesSchema = z.union(SLOT_MINUTES.map((value) => z.literal(value)));

/** A calendar date at the venue, `YYYY-MM-DD`, never an ISO instant. */
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-05.")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "That date does not exist.");

/** A local time at the venue, `HH:mm`. The action converts it to UTC. */
export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 18:30.");

/**
 * A closing time, which may be `24:00` (spec 0007, AC-8). Only a close is ever
 * allowed to be midnight: `localTimeSchema` is unchanged, so `24:00` can never
 * be an open time or a booking start.
 */
export const closeTimeSchema = z
  .string()
  .regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, "Use a time like 22:00, or 24:00 for midnight.");

const idSchema = z.int().positive();
const versionSchema = z.int().positive();

/** Pesos, exact to the centavo, matching `numeric(10,2)`. */
export const amountSchema = z
  .number()
  .nonnegative("An amount cannot be negative.")
  .max(99_999_999.99)
  .multipleOf(0.01, "An amount goes to two decimal places at most.");

export const scheduleDateSchema = z.object({
  date: calendarDateSchema.optional(),
});

/** What a customer is called on a booking. Spec 0005 AC-4: required on a booking. */
export const customerNameSchema = z
  .string()
  .trim()
  .min(1, "A booking needs a customer name.")
  .max(80, "Keep the name to 80 characters.");

/**
 * A phone number, loosely. Spec 0005 AC-4: digits, spaces, plus and dashes,
 * 7 to 30 characters. It is stored as typed; the details sheet strips it down
 * for the tap to call link.
 */
export const customerPhoneSchema = z
  .string()
  .trim()
  .regex(/^[\d\s+-]{7,30}$/, "Use digits, spaces, plus and dashes, 7 to 30 characters.");

/** The free text on a booking or a closure. */
export const noteSchema = z.string().trim().max(200, "Keep the note to 200 characters.");

const reservationFields = {
  courtId: idSchema,
  date: calendarDateSchema,
  startTime: localTimeSchema,
  // A booking may end at midnight, never start there (spec 0007, AC-10).
  endTime: closeTimeSchema,
  kind: reservationKindSchema,
  customerName: customerNameSchema.optional(),
  customerPhone: customerPhoneSchema.optional(),
  note: noteSchema.optional(),
  paymentStatus: paymentStatusSchema.optional(),
  amount: amountSchema.optional(),
};

/** A booking always names a customer; a closure does not need one (invariant 3). */
function requireCustomerName(
  value: { kind?: string; customerName?: string },
  ctx: z.RefinementCtx,
) {
  if (value.kind === "booking" && !value.customerName) {
    ctx.addIssue({
      code: "custom",
      path: ["customerName"],
      message: "A booking needs a customer name.",
    });
  }
}

/** `ends_at > starts_at` (invariant 2), checked before the database has to. */
function requireEndAfterStart(
  value: { startTime?: string; endTime?: string },
  ctx: z.RefinementCtx,
) {
  if (value.startTime && value.endTime && value.endTime <= value.startTime) {
    ctx.addIssue({
      code: "custom",
      path: ["endTime"],
      message: "The end time has to be after the start time.",
    });
  }
}

export const createReservationSchema = z.object(reservationFields).superRefine((value, ctx) => {
  requireCustomerName(value, ctx);
  requireEndAfterStart(value, ctx);
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

/** One contiguous stretch on one court, the unit a selection is written in. */
export const reservationRunSchema = z
  .object({
    courtId: idSchema,
    date: calendarDateSchema,
    startTime: localTimeSchema,
    endTime: closeTimeSchema,
  })
  .superRefine(requireEndAfterStart);

export type ReservationRun = z.infer<typeof reservationRunSchema>;

/** The most runs one Book or Close court press may write. Spec 0005. */
export const MAX_RUNS_PER_SET = 20;

/**
 * A whole selection at once. Spec 0005, AC-4 and AC-5.
 *
 * The rows share one set of customer fields and land in one insert, so the
 * exclusion constraint refuses all of them or none. The runs are checked
 * against each other here because the network sends whatever it likes, and two
 * runs that overlap on one court would only ever be caught by the database.
 */
export const createReservationsSchema = z
  .object({
    runs: z.array(reservationRunSchema).min(1, "Pick at least one hour.").max(MAX_RUNS_PER_SET),
    kind: reservationKindSchema,
    customerName: customerNameSchema.optional(),
    customerPhone: customerPhoneSchema.optional(),
    note: noteSchema.optional(),
    paymentStatus: paymentStatusSchema.optional(),
    amount: amountSchema.optional(),
  })
  .superRefine((value, ctx) => {
    requireCustomerName(value, ctx);
    const byCourt = new Map<number, ReservationRun[]>();
    for (const run of value.runs) {
      const list = byCourt.get(run.courtId) ?? [];
      list.push(run);
      byCourt.set(run.courtId, list);
    }
    for (const runs of byCourt.values()) {
      const sorted = [...runs].sort((a, b) =>
        `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`),
      );
      for (let index = 1; index < sorted.length; index += 1) {
        const previous = sorted[index - 1];
        const current = sorted[index];
        const previousEnd = `${previous.date}T${previous.endTime}`;
        const currentStart = `${current.date}T${current.startTime}`;
        if (currentStart < previousEnd) {
          ctx.addIssue({
            code: "custom",
            path: ["runs"],
            message: "Two of the runs overlap on the same court.",
          });
          return;
        }
      }
    }
  });

export type CreateReservationsInput = z.infer<typeof createReservationsSchema>;

export const updateReservationSchema = z
  .object({
    id: idSchema,
    version: versionSchema,
    courtId: reservationFields.courtId.optional(),
    date: reservationFields.date.optional(),
    startTime: reservationFields.startTime.optional(),
    endTime: reservationFields.endTime.optional(),
    kind: reservationFields.kind.optional(),
    customerName: reservationFields.customerName,
    customerPhone: customerPhoneSchema.nullish(),
    note: noteSchema.nullish(),
    paymentStatus: reservationFields.paymentStatus,
    amount: amountSchema.nullish(),
  })
  .superRefine((value, ctx) => {
    requireEndAfterStart(value, ctx);
    // Moving one edge of a booking means the action needs the other one too,
    // because a half given range cannot be converted to UTC on its own. The one
    // exception is spec 0005 AC-8: a closure edit sends `endTime` on its own and
    // the action rebuilds `ends_at` from the stored row's date.
    const edges = [value.date, value.startTime, value.endTime].filter(Boolean).length;
    const endTimeAlone = edges === 1 && value.endTime !== undefined;
    if (edges > 0 && edges < 3 && !endTimeAlone) {
      ctx.addIssue({
        code: "custom",
        path: ["startTime"],
        message: "Send the date, the start time and the end time together when you move a booking.",
      });
    }
  });

export type UpdateReservationInput = z.infer<typeof updateReservationSchema>;

export const cancelReservationSchema = z.object({
  id: idSchema,
  version: versionSchema,
});

export const courtNameSchema = z
  .string()
  .trim()
  .min(1, "A court needs a name.")
  .max(40, "Keep the name to 40 characters.");

export const courtNoteSchema = z.string().trim().max(200, "Keep the note to 200 characters.");

export const saveCourtSchema = z
  .object({
    id: idSchema.optional(),
    version: versionSchema.optional(),
    name: courtNameSchema,
    // Optional on create, where the action puts the new court last (spec 0007,
    // AC-3). Required on an edit, so the sheet never moves a court by accident.
    sortOrder: z.int().min(0).max(9999).optional(),
    note: courtNoteSchema.nullish(),
    // Clearing `retired_at` brings a court back. Its old sort order may be taken
    // by now, which is an artifact of the partial unique index rather than a
    // decision anybody made, so the action moves it to the next free one.
    restore: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.id !== undefined && value.sortOrder === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["sortOrder"],
        message: "Editing a court needs its current position.",
      });
    }
  });

export type SaveCourtInput = z.infer<typeof saveCourtSchema>;

/** The most courts one reorder may carry. Far above what any venue has. */
export const MAX_COURTS_PER_REORDER = 50;

/**
 * The whole live list in its new order (spec 0007, AC-5). Every entry carries
 * the version the page read, so `reorder_courts` can refuse a stale list
 * before anything moves.
 */
export const reorderCourtsSchema = z
  .object({
    courts: z
      .array(z.object({ id: idSchema, version: versionSchema }))
      .min(1, "Send at least one court.")
      .max(MAX_COURTS_PER_REORDER),
  })
  .refine((value) => new Set(value.courts.map((court) => court.id)).size === value.courts.length, {
    path: ["courts"],
    message: "A court appears twice in the list.",
  });

export type ReorderCourtsInput = z.infer<typeof reorderCourtsSchema>;

export const retireCourtSchema = z.object({
  id: idSchema,
  version: versionSchema,
});

/**
 * One day of the week's hours (spec 0007, AC-8). Either both times are there
 * with the close after the open, or both are absent, which is what closed
 * means. `24:00` is a close and never an open, which is why the two fields use
 * different schemas.
 */
export const venueDaySchema = z
  .object({
    dayOfWeek: z.int().min(0).max(6),
    open: localTimeSchema.nullable(),
    close: closeTimeSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if ((value.open === null) !== (value.close === null)) {
      ctx.addIssue({
        code: "custom",
        path: [value.open === null ? "open" : "close"],
        message: "A day needs both times, or neither if it is closed.",
      });
      return;
    }
    if (value.open !== null && value.close !== null && value.close <= value.open) {
      ctx.addIssue({
        code: "custom",
        path: ["close"],
        message: "The closing time has to be after the opening time.",
      });
    }
  });

export const saveVenueSettingsSchema = z
  .object({
    version: versionSchema,
    // Exactly seven, one per day of the week. The array is the whole week
    // because the week is one edit (spec 0007, AC-17).
    days: z.array(venueDaySchema).length(7),
    slotMinutes: slotMinutesSchema,
    bookingHorizonDays: z.int().min(1).max(365),
    // Spec 0007, AC-9: the second step of a save that strands bookings outside
    // the new hours. Without it the action counts and refuses; with it, it writes.
    acknowledge: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const seen = new Set(value.days.map((day) => day.dayOfWeek));
    if (seen.size !== 7) {
      ctx.addIssue({
        code: "custom",
        path: ["days"],
        message: "Send one row per day of the week, Sunday through Saturday.",
      });
    }
  });

export type SaveVenueSettingsInput = z.infer<typeof saveVenueSettingsSchema>;
