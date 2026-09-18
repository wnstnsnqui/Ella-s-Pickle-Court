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

const hoursChangedSchema = z
  .object({
    weekday_open: z.string(),
    weekday_close: z.string(),
    weekend_open: z.string(),
    weekend_close: z.string(),
    slot_minutes: z.number(),
    booking_horizon_days: z.number(),
  })
  .strict();

const boardDayViewedSchema = z
  .object({
    day_offset: z.number().int(),
  })
  .strict();

const privacyNoticeAcknowledgedSchema = z
  .object({
    version: z.string(),
  })
  .strict();

const staffRoleChangedSchema = z
  .object({
    target_clerk_user_id: z.string(),
    role: z.enum(["staff", "owner", "admin", "superadmin"]),
    is_active: z.boolean(),
  })
  .strict();

/**
 * Every event `captureStaffEvent()` or `captureDayViewed()` may send, and the
 * schema its properties must pass. Adding an event means adding a row here
 * first; there is no way to send an event this map does not name.
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
  privacy_notice_acknowledged: privacyNoticeAcknowledgedSchema,
  staff_role_changed: staffRoleChangedSchema,
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
