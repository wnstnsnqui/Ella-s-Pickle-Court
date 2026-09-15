import { NextResponse, type NextRequest } from "next/server";

import { fail, type ActionResult } from "@/lib/actions";
import { getSchedule, type Schedule } from "@/lib/schedule/queries";
import { scheduleDateSchema } from "@/lib/schedule/schemas";

/**
 * The public board's re read of the day. Spec 0006, AC-2 and AC-5.
 *
 * A Route Handler rather than a Server Action, because every Server Action here
 * starts with `requireStaff()` and this read is for anyone. It is a plain GET
 * with a path, so `proxy.ts` can rate limit it and curl can check it. The body
 * is the same `ActionResult` shape the staff transport already returns, and the
 * read behind it is `getSchedule()` unchanged: the anon client, four columns,
 * today onward.
 */
export const dynamic = "force-dynamic";

const STATUS_FOR: Record<string, number> = {
  invalid: 422,
  failed: 500,
};

export async function GET(request: NextRequest) {
  const parsed = scheduleDateSchema.safeParse({
    date: request.nextUrl.searchParams.get("date") ?? undefined,
  });

  const result: ActionResult<Schedule> = parsed.success
    ? await getSchedule(parsed.data.date)
    : fail({
        kind: "invalid",
        message: "Use a date like 2026-09-05.",
        issues: { date: ["Use a date like 2026-09-05."] },
      });

  const status = result.ok ? 200 : (STATUS_FOR[result.error.kind] ?? 500);
  return NextResponse.json(result, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
