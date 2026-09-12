import { NextResponse } from "next/server";

import { publicSupabase } from "@/lib/supabase/public";

/**
 * The health endpoint spec 0001 asks for from day one.
 *
 * A board whose whole value is being current is worthless if it dies quietly, so
 * point an uptime ping at this. It reports degraded rather than throwing when the
 * database is unreachable, so the response body tells you which half is broken.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "unreachable" | "unconfigured" = "ok";

  try {
    const { error } = await publicSupabase().from("court").select("id").limit(1);
    if (error) database = "unreachable";
  } catch {
    database = "unconfigured";
  }

  const healthy = database === "ok";
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
