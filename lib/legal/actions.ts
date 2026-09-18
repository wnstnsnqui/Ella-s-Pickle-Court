"use server";

import { z } from "zod";

import { fail, ok, requireStaff, type ActionResult } from "@/lib/actions";
import { captureStaffEvent, reportFailure } from "@/lib/analytics/server";

import { PRIVACY_NOTICE_VERSION } from "./constants";

/**
 * The one write behind the staff acknowledgement dialog. Spec 0010, AC-11.
 *
 * The client never imports `lib/legal/constants.ts`; it sends back the
 * `noticeVersion` prop the layout rendered it with. A literal schema is the
 * whole check: a version that does not match the server's own constant (a
 * long lived tab open across a deploy that bumped it) fails validation here,
 * before the database is ever asked, and is refused with `invalid` rather
 * than silently accepted or than a raw RPC error.
 */
const acknowledgePrivacyNoticeSchema = z.object({
  version: z.literal(PRIVACY_NOTICE_VERSION),
});

export async function acknowledgePrivacyNotice(
  input: unknown,
): Promise<ActionResult<{ version: string }>> {
  const staff = await requireStaff();
  if (!staff.ok) return fail(staff.error);

  const parsed = acknowledgePrivacyNoticeSchema.safeParse(input);
  if (!parsed.success) {
    return fail({
      kind: "invalid",
      message: "This notice has changed since the page loaded. Reload the page and try again.",
      issues: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    });
  }

  const { data, error } = await staff.supabase.rpc("acknowledge_privacy_notice", {
    p_version: parsed.data.version,
  });
  if (error) {
    // Every RPC failure here, `no_data_found` included, is unexpected: a
    // signed in staff member with no staff row should not be possible once
    // `ensure_staff()` has already run for this same request. Report it.
    reportFailure(error, { action: "acknowledgePrivacyNotice", distinctId: staff.staffId });
    return fail({ kind: "failed", message: "Could not record that you saw the notice." });
  }

  captureStaffEvent(staff.staffId, "privacy_notice_acknowledged", { version: data });
  return ok({ version: data });
}
