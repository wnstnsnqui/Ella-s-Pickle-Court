import { formatDayHeading } from "@/lib/time";
import { VENUE_NAME } from "@/lib/venue";

/**
 * What names the day on a board: the tab title and the address. Spec 0014,
 * AC-4 and AC-10.
 *
 * Both follow the day that landed on screen, never the one being read, so a
 * reload or a copied address shows what the reader was looking at. Plain
 * module, no React and no `server-only`: `generateMetadata` and the board in
 * the browser read the same title from here.
 */

/** The site's title when a page names no day. The root layout's default. */
export const DEFAULT_TITLE = `${VENUE_NAME} · Court schedule`;

/** The public board's title for a day, or the default when the board is undated. */
export function boardTitle(date?: string): string {
  return date === undefined
    ? DEFAULT_TITLE
    : `Court schedule for ${formatDayHeading(date)} · ${VENUE_NAME}`;
}

/**
 * The address for a board showing `date`, from the address it is on now:
 * `date` set, every other search parameter kept, and `date` removed when the
 * board means today (undefined), so it keeps following the venue's day.
 */
export function boardHref(current: string, date?: string): string {
  const url = new URL(current);
  if (date === undefined) url.searchParams.delete("date");
  else url.searchParams.set("date", date);
  return `${url.pathname}${url.search}${url.hash}`;
}
