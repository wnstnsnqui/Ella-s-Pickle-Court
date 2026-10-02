import { z } from "zod";

import { calendarDateSchema } from "@/lib/schedule/schemas";

/**
 * The online booking inputs, checked twice: once in the sheet so a player sees
 * a mistake next to its field (spec 0015, AC-2), and again in the Server
 * Action, because an action accepts whatever the network sends. Pure, so the
 * sheet and the action share one copy.
 */

/**
 * A Philippine mobile in the one form it is stored in, `+639XXXXXXXXX`, from
 * `09XX XXX XXXX` or `+63 9XX XXX XXXX` with any spaces or dashes. Null when
 * it is neither.
 */
export function normalizePhilippineMobile(input: string): string | null {
  const compact = input.replace(/[\s-]/g, "");
  const match = /^(?:\+63|0)(9\d{9})$/.exec(compact);
  return match ? `+63${match[1]}` : null;
}

export const bookingNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(80, "Keep your name to 80 characters.");

export const bookingPhoneSchema = z
  .string()
  .trim()
  .min(1, "Enter your mobile number.")
  .transform((value, context) => {
    const phone = normalizePhilippineMobile(value);
    if (phone) return phone;
    context.addIssue({
      code: "custom",
      message: "Use a Philippine mobile number, like 0917 123 4567.",
    });
    return z.NEVER;
  });

export const bookingEmailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email.")
  .max(254, "Keep your email to 254 characters.")
  .pipe(z.email("Enter a valid email, like you@example.com."));

/** The Details step (AC-2). The phone comes out normalized. */
export const bookingDetailsSchema = z.object({
  name: bookingNameSchema,
  phone: bookingPhoneSchema,
  email: bookingEmailSchema,
});

export type BookingDetailsInput = z.input<typeof bookingDetailsSchema>;
export type BookingDetails = z.output<typeof bookingDetailsSchema>;

export const EMPTY_BOOKING_DETAILS: BookingDetailsInput = { name: "", phone: "", email: "" };

/** One picked hour: a court and the instant its slot starts. */
export const bookingPickSchema = z.object({
  courtId: z.number().int().positive(),
  startsAt: z.iso.datetime({ offset: true }),
});

/**
 * What `holdOnlineBooking` accepts (the API surface in spec 0015). No price
 * and no path: the database works out both.
 */
export const holdInputSchema = z.object({
  submissionId: z.uuid({ version: "v4" }),
  date: calendarDateSchema,
  picks: z.array(bookingPickSchema).min(1).max(200),
  name: bookingNameSchema,
  phone: bookingPhoneSchema,
  email: bookingEmailSchema,
  /**
   * The three boxes on the Terms step (AC-3), each its own literal, so a direct
   * call cannot skip one: the booking rules, the site's Terms, and the Data
   * Privacy Act consent.
   */
  consent: z.object({
    rules: z.literal(true),
    terms: z.literal(true),
    privacy: z.literal(true),
  }),
  /** Redeemed at Siteverify before anything is minted (AC-19). Single use. */
  turnstileToken: z.string().min(1).max(2048),
});

export type HoldInput = z.input<typeof holdInputSchema>;

/** The last 4 digits of the transfer's reference number (AC-8). */
export const referenceLast4Schema = z
  .string()
  .trim()
  .regex(/^\d{4}$/, "Enter the last 4 digits of the reference number.");

/**
 * What `submitOnlineBooking` accepts (AC-12): the sheet's capability and the
 * digits. Never a path: the database already knows where the proof is.
 */
export const submitInputSchema = z.object({
  submissionId: z.uuid({ version: "v4" }),
  referenceLast4: referenceLast4Schema,
});

export type SubmitInput = z.input<typeof submitInputSchema>;

const runSchema = z.object({
  court_id: z.number(),
  starts_at: z.string(),
  ends_at: z.string(),
  amount: z.coerce.number(),
});

const slotSchema = z.object({ court_id: z.number(), starts_at: z.string() });

/** The fields every successful answer shares: the booking as the player may see it. */
const bookingAnswerFields = {
  ok: z.literal(true),
  booking_id: z.number(),
  code: z.string(),
  status: z.string(),
  proof_path: z.string().nullable(),
  hold_expires_at: z.string().nullable(),
  server_now: z.string(),
  amount: z.coerce.number(),
  runs: z.array(runSchema),
};

/**
 * What `hold_online_booking` answers with: the booking, or a business refusal.
 * Parsed rather than trusted, so a change in the SQL surfaces here as a
 * `failed` rather than as a sheet reading `undefined`.
 */
export const holdAnswerSchema = z.discriminatedUnion("ok", [
  z.object({
    ...bookingAnswerFields,
    proof_path: z.string(),
    hold_expires_at: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["invalid", "out_of_range", "rate_limited", "slot_taken"]),
    slots: z.array(slotSchema).optional(),
    retry_after_seconds: z.number().optional(),
  }),
]);

/** What `submit_online_booking` answers with: the receipt, or a refusal (AC-12, AC-13). */
export const submitAnswerSchema = z.discriminatedUnion("ok", [
  z.object({
    ...bookingAnswerFields,
    customer: z.object({
      name: z.string(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
    }),
    reference_last4: z.string(),
    submitted_at: z.string(),
    retaken: z.boolean(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["invalid", "not_found", "proof_missing", "slot_taken"]),
    slots: z.array(slotSchema).optional(),
  }),
]);

/** What `releaseOnlineBooking` accepts (AC-15): the sheet's capability, nothing else. */
export const releaseInputSchema = z.object({
  submissionId: z.uuid({ version: "v4" }),
});

/** What `release_online_booking` answers with: whether a live hold was ended. */
export const releaseAnswerSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), released: z.boolean() }),
  z.object({ ok: z.literal(false), reason: z.literal("invalid") }),
]);
