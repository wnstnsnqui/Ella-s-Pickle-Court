import { z } from "zod";

/**
 * The analytics allow list. Spec 0009, AC-5.
 *
 * One `.strict()` Zod schema per event name: enforcement here is a list of what
 * may be sent, never a list of what must be scrubbed, so a customer's name,
 * phone, note or amount cannot leak by a caller simply forgetting to strip it.
 * `captureStaffEvent()` in `lib/analytics/server.ts` parses every property bag
 * through the schema for its event and drops the whole event on a parse
 * failure, never sending a partial one.
 */

const reservationKindSchema = z.enum(["booking", "closure"]);

const reservationEventSchema = z
  .object({
    reservation_id: z.number(),
    court_id: z.number(),
    court_name: z.string(),
    kind: reservationKindSchema,
    action: z.enum(["created", "edited", "cancelled"]),
    starts_at: z.string(),
    ends_at: z.string(),
    duration_minutes: z.number(),
    lead_time_hours: z.number().optional(),
  })
  .strict();

const courtChangedSchema = z
  .object({
    court_id: z.number().nullable(),
    court_name: z.string().nullable(),
    action: z.enum(["created", "renamed", "note", "restored", "retired", "reordered"]),
  })
  .strict();

// Spec 0007, AC-24: the shape of the week rather than its twenty one values.
// `earliest_open` and `latest_close` are both null when no day is open, since a
// week with no open days has no earliest or latest to report.
const hoursChangedSchema = z
  .object({
    days_open: z.number(),
    days_closed: z.number(),
    earliest_open: z.string().nullable(),
    latest_close: z.string().nullable(),
    slot_minutes: z.number(),
    booking_horizon_days: z.number(),
  })
  .strict();

const boardDayViewedSchema = z
  .object({
    day_offset: z.number().int(),
  })
  .strict();

/**
 * Spec 0013, AC-14: someone pressed "Request booking" on the landing page.
 * Counts only, never which hours or which day, so demand can be measured
 * without anything that could identify a player.
 */
const bookingIntentSchema = z
  .object({
    slots: z.number().int().positive(),
    courts: z.number().int().positive(),
    days_ahead: z.number().int().nonnegative(),
  })
  .strict();

/**
 * Spec 0015, AC-24: the online checkout, sent cookieless by
 * `capturePublicEvent()`. Counts and fixed words only: never a code, a name,
 * a phone, an email, the reference digits, a path or a client hash.
 */
const onlineBookingHeldSchema = z
  .object({
    slots: z.number().int().positive(),
    courts: z.number().int().positive(),
    days_ahead: z.number().int().nonnegative(),
  })
  .strict();

const onlineBookingSubmittedSchema = z
  .object({
    slots: z.number().int().positive(),
    retaken: z.boolean(),
  })
  .strict();

const onlineBookingRefusedSchema = z
  .object({
    stage: z.enum(["hold", "submit"]),
    reason: z.enum(["slot_taken", "out_of_range", "rate_limited", "bot_check", "proof_missing"]),
  })
  .strict();

/**
 * Spec 0016, AC-19: the staff check. How long a check waited and why a
 * booking ended, never a code, a name, an amount or a note.
 */
const onlineBookingConfirmedSchema = z
  .object({
    minutes_waiting: z.number().int().nonnegative(),
  })
  .strict();

const onlineBookingEndedSchema = z
  .object({
    reason: z.enum([
      "no_payment",
      "amount_mismatch",
      "reference_mismatch",
      "invalid_proof",
      "player_asked",
      "payment_reversed",
      "venue_issue",
      "other",
    ]),
    refund_owed: z.boolean(),
    was_confirmed: z.boolean(),
  })
  .strict();

const onlineBookingRefundSettledSchema = z
  .object({
    outcome: z.enum(["refunded", "not_owed"]),
  })
  .strict();

const privacyNoticeAcknowledgedSchema = z
  .object({
    version: z.string(),
  })
  .strict();

const staffRoleChangedSchema = z
  .object({
    target_user_id: z.string(),
    role: z.enum(["staff", "owner", "admin", "superadmin"]),
    is_active: z.boolean(),
  })
  .strict();

/** The four link events of spec 0004 (revised), AC-13. */
const linkKindSchema = z.enum(["invite", "reset"]);

const staffInviteCreatedSchema = z
  .object({
    kind: linkKindSchema,
    role: z.enum(["staff", "admin", "superadmin"]).nullable(),
  })
  .strict();

const staffInviteRevokedSchema = z.object({ kind: linkKindSchema }).strict();

const staffInviteRedeemedSchema = z
  .object({
    kind: linkKindSchema,
    method: z.literal("password"),
  })
  .strict();

const staffPasswordChangedSchema = z
  .object({
    source: z.enum(["reset", "account"]),
  })
  .strict();

/**
 * Every event `captureStaffEvent()`, `capturePublicEvent()`, `captureDayViewed()`
 * or `captureBookingIntent()` may send, and the schema its properties must pass.
 * Adding an event means adding a row here first; there is no way to send an
 * event this map does not name.
 */
export const eventSchemas = {
  booking_created: reservationEventSchema,
  booking_edited: reservationEventSchema,
  booking_cancelled: reservationEventSchema,
  closure_created: reservationEventSchema,
  closure_edited: reservationEventSchema,
  closure_cancelled: reservationEventSchema,
  court_changed: courtChangedSchema,
  hours_changed: hoursChangedSchema,
  board_day_viewed: boardDayViewedSchema,
  booking_intent: bookingIntentSchema,
  online_booking_held: onlineBookingHeldSchema,
  online_booking_submitted: onlineBookingSubmittedSchema,
  online_booking_refused: onlineBookingRefusedSchema,
  online_booking_confirmed: onlineBookingConfirmedSchema,
  online_booking_rejected: onlineBookingEndedSchema,
  online_booking_cancelled: onlineBookingEndedSchema,
  online_booking_refund_settled: onlineBookingRefundSettledSchema,
  privacy_notice_acknowledged: privacyNoticeAcknowledgedSchema,
  staff_role_changed: staffRoleChangedSchema,
  staff_invite_created: staffInviteCreatedSchema,
  staff_invite_revoked: staffInviteRevokedSchema,
  staff_invite_redeemed: staffInviteRedeemedSchema,
  staff_password_changed: staffPasswordChangedSchema,
} satisfies Record<string, z.ZodType>;

export type AnalyticsEvent = keyof typeof eventSchemas;
export type EventProperties<E extends AnalyticsEvent> = z.infer<(typeof eventSchemas)[E]>;

/** Parse a property bag against its event's allow list. Never throws. */
export function parseEventProperties<E extends AnalyticsEvent>(
  event: E,
  properties: EventProperties<E>,
): { ok: true; data: EventProperties<E> } | { ok: false; issues: string[] } {
  const result = eventSchemas[event].safeParse(properties);
  if (result.success) return { ok: true, data: result.data as EventProperties<E> };
  return { ok: false, issues: result.error.issues.map((issue) => issue.path.join(".")) };
}

/** The shape a PostgREST error arrives in. Mirrors `lib/actions.ts`. */
type PostgrestErrorLike = { code?: string; message: string; details?: unknown; hint?: unknown };

/**
 * Reduce a Postgres error to the two fields worth reporting. `details` and
 * `hint` on a PostgREST error routinely echo the row's own values (a
 * constraint violation quotes the offending columns), so they never leave the
 * box. Spec 0009, AC-5, AC-7.
 */
export function scrubError(error: PostgrestErrorLike): {
  code: string | undefined;
  message: string;
} {
  return { code: error.code, message: error.message };
}
