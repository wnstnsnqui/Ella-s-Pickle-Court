import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { BoardNotice } from "@/components/board-notice";
import { PublicBoard } from "@/components/board/public-board";
import { PublicScheduleProvider } from "@/components/board/public-schedule-context";
import { PublicToolbar } from "@/components/board/public-toolbar";
import { VenueJsonLd } from "@/components/board/venue-json-ld";
import { StaffMenu } from "@/components/staff-menu";
import { Button } from "@/components/ui/button";
import { getSchedule } from "@/lib/schedule/queries";
import { formatDayHeading } from "@/lib/time";
import { VENUE_NAME, VENUE_TAGLINE } from "@/lib/venue";

/**
 * The public board. Spec 0006.
 *
 * The page a player opens before driving over: today's grid for every court,
 * read per request on the anonymous client, no sign in, and kept current by
 * the board underneath. A page whose value is being current is never cached.
 */
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function requestedDate(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

/**
 * The venue's title on `/`, the day in the title on a dated link, and every
 * dated link canonical to `/` so the search engines see one page (AC-11).
 * `getSchedule` is memoised per request, so this costs no second read.
 */
export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const date = requestedDate((await searchParams).date);
  const base: Metadata = { alternates: { canonical: "/" } };
  if (date === undefined) return base;

  const result = await getSchedule(date);
  if (!result.ok) return base;
  const day = formatDayHeading(result.data.grid.date);
  return {
    ...base,
    // The root layout's title template does not reach a page in its own
    // segment (see `generate-metadata.md` in `node_modules/next/dist/docs`),
    // so the venue name is added here by hand.
    title: `Court schedule for ${day} · ${VENUE_NAME}`,
    description: `Which courts at ${VENUE_NAME} are free on ${day}. ${VENUE_TAGLINE}`,
  };
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const date = requestedDate((await searchParams).date);
  const result = await getSchedule(date);

  if (!result.ok) {
    return (
      <BoardNotice icon={CircleAlert} heading="Court schedule" title="That day could not be shown">
        <p>{result.error.message}</p>
        <Button asChild variant="outline">
          <Link href="/">Back to today</Link>
        </Button>
      </BoardNotice>
    );
  }

  const { grid, hours } = result.data;

  return (
    <PublicScheduleProvider
      // A new day is a new board: the clock, the highlight and the scroll start fresh.
      key={grid.date}
      initial={result.data}
      requestedDate={date}
    >
      <AppShell
        toolbar={<PublicToolbar />}
        staff={
          <Suspense fallback={null}>
            <StaffMenu />
          </Suspense>
        }
      >
        <VenueJsonLd hours={hours} url={SITE_URL} />
        <div className="mb-4 flex flex-col gap-1">
          <h1 className="text-title">Court schedule</h1>
          <p className="text-caption text-muted-foreground">{VENUE_TAGLINE}</p>
        </div>
        <PublicBoard />
      </AppShell>
    </PublicScheduleProvider>
  );
}
