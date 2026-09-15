import { z } from "zod";

import { calendarDateSchema } from "@/lib/schedule/schemas";

import { DEFAULT_REPORT_RANGE, REPORT_RANGE_PRESETS } from "./range";

/**
 * The report's three query string parameters, spec 0008 AC-2. Every field
 * catches its own failure so a bad or stale value behaves exactly like an
 * absent one: no error page, just the default.
 */
export const reportQuerySchema = z.object({
  range: z.enum(REPORT_RANGE_PRESETS).catch(DEFAULT_REPORT_RANGE),
  // Coerced so `court=2` in a URL becomes the number 2; anything that does not
  // coerce to a positive integer (including a missing value) falls back to
  // "all courts" rather than an error.
  court: z.coerce.number().int().positive().optional().catch(undefined),
  // A day outside the resolved range is ignored by the page, not here: this
  // schema only has to agree the string is a real calendar date.
  day: calendarDateSchema.optional().catch(undefined),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
