import { z } from "zod";

import {
  CANCEL_REASON_VALUES,
  CODE_INVALID_MESSAGE,
  NOTE_MAX,
  REFUND_MAX,
  REJECT_REASON_VALUES,
  normalizeBookingCode,
} from "./constants";

/**
 * Zod for every staff check Server Action input and every decision function
 * answer (spec 0016). Server Actions accept whatever the network sends; the
 * database checks everything again.
 */

const bookingIdSchema = z.int().positive();
const versionSchema = z.int().positive();

export const bookingRefSchema = z.object({ bookingId: bookingIdSchema });

export const findBookingSchema = z.object({
  code: z
    .string()
    .max(20, CODE_INVALID_MESSAGE)
    .transform((value, ctx) => {
      const code = normalizeBookingCode(value);
      if (code === null) {
        ctx.addIssue({ code: "custom", message: CODE_INVALID_MESSAGE });
        return z.NEVER;
      }
      return code;
    }),
});

export const confirmInputSchema = z.object({
  bookingId: bookingIdSchema,
  version: versionSchema,
});

/** Trimmed; an empty note is no note. */
const noteSchema = z
  .string()
  .trim()
  .max(NOTE_MAX, `Keep the note to ${NOTE_MAX} characters.`)
  .optional()
  .transform((value) => (value ? value : undefined));

const NOTE_REQUIRED = "Say what happened in the note.";

function requireNoteForOther(value: { reason: string; note?: string }, ctx: z.core.$RefinementCtx) {
  if (value.reason === "other" && !value.note) {
    ctx.addIssue({ code: "custom", path: ["note"], message: NOTE_REQUIRED });
  }
}

export const rejectInputSchema = z
  .object({
    bookingId: bookingIdSchema,
    version: versionSchema,
    reason: z.enum(REJECT_REASON_VALUES, "Pick a reason."),
    note: noteSchema,
    refundOwed: z.boolean(),
  })
  .superRefine(requireNoteForOther);

export const cancelInputSchema = z
  .object({
    bookingId: bookingIdSchema,
    version: versionSchema,
    reason: z.enum(CANCEL_REASON_VALUES, "Pick a reason."),
    note: noteSchema,
    refundOwed: z.boolean(),
  })
  .superRefine(requireNoteForOther);

export const settleInputSchema = z.discriminatedUnion("outcome", [
  z.object({
    bookingId: bookingIdSchema,
    version: versionSchema,
    outcome: z.literal("refunded"),
    amount: z
      .number("Enter the amount sent back.")
      .positive("The amount has to be more than ₱0.")
      .max(REFUND_MAX, "That is more than a refund can be.")
      // Centavos at most; compared with a tolerance, since 10.1 * 100 is not 1010 in floating point.
      .refine(
        (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6,
        "Use at most two decimals.",
      ),
    note: noteSchema,
  }),
  z.object({
    bookingId: bookingIdSchema,
    version: versionSchema,
    outcome: z.literal("not_owed"),
    note: z
      .string()
      .trim()
      .min(1, "Say why no refund is needed.")
      .max(NOTE_MAX, `Keep the note to ${NOTE_MAX} characters.`),
  }),
]);

export type RejectInput = z.input<typeof rejectInputSchema>;
export type CancelInput = z.input<typeof cancelInputSchema>;
export type SettleInput = z.input<typeof settleInputSchema>;

/** What every decision function answers with (the spec 0016 Decision). */
export const decisionAnswerSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    version: z.number(),
    previous_status: z.string(),
    submitted_at: z.string().nullable(),
    decided_at: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["stale", "wrong_state", "forbidden", "not_found", "invalid"]),
  }),
]);

export type DecisionAnswer = z.infer<typeof decisionAnswerSchema>;
