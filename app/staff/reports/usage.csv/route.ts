import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { buildUsageCsv } from "@/lib/report/csv";
import { getUsageReport } from "@/lib/report/queries";
import { reportQuerySchema } from "@/lib/report/schemas";
import { isOwnerLevel } from "@/lib/schedule/constants";
import { currentStaff } from "@/lib/staff";

/**
 * The CSV behind the charts. Spec 0008, AC-9.
 *
 * A Route Handler, not a Server Action, so the toolbar's Download CSV link
 * can point straight at it. `court_usage` is still the enforcement point: the
 * checks below are the same courtesy `/staff/reports` gives, in status codes
 * rather than a redirect.
 */
export const dynamic = "force-dynamic";

function textResponse(message: string, status: number): NextResponse {
  return new NextResponse(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return textResponse("Sign in to download this report.", 401);

  const current = await currentStaff();
  if (current.kind !== "ok" || !current.staff.isActive || !isOwnerLevel(current.staff.role)) {
    return textResponse("Your account is not allowed to read this report.", 403);
  }

  const query = reportQuerySchema.parse({
    range: request.nextUrl.searchParams.get("range") ?? undefined,
    court: request.nextUrl.searchParams.get("court") ?? undefined,
  });

  const result = await getUsageReport({ range: query.range, courtId: query.court });
  if (!result.ok) {
    const status = result.error.kind === "forbidden" ? 403 : 503;
    return textResponse(result.error.message, status);
  }

  const body = buildUsageCsv(result.data.rows, result.data.courts);
  const filename = `usage-${result.data.from}-${result.data.to}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
