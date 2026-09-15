import type { ReportCourt, UsageRow } from "./queries";

/**
 * The CSV behind the charts. Spec 0008, AC-9: usage rows only, RFC 4180
 * quoting, `\r\n` line endings.
 */

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function weekdayShort(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return WEEKDAY_SHORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildUsageCsv(rows: readonly UsageRow[], courts: readonly ReportCourt[]): string {
  const courtById = new Map(courts.map((court) => [court.id, court]));
  const sorted = [...rows].sort((a, b) => {
    const orderA = courtById.get(a.courtId)?.sortOrder ?? 0;
    const orderB = courtById.get(b.courtId)?.sortOrder ?? 0;
    return orderA - orderB || a.localDate.localeCompare(b.localDate) || a.hour - b.hour;
  });

  const lines = ["court,date,weekday,hour,booked_minutes"];
  for (const row of sorted) {
    const courtName = courtById.get(row.courtId)?.name ?? `Court ${row.courtId}`;
    lines.push(
      [
        csvField(courtName),
        row.localDate,
        weekdayShort(row.localDate),
        String(row.hour),
        String(row.bookedMinutes),
      ].join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
