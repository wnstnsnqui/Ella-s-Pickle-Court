import type { StaffName, StaffReservation } from "@/lib/schedule/queries";
import {
  calendarDateInZone,
  formatSlotLabel,
  localEndTimeInZone,
  localTimeInZone,
} from "@/lib/time";

/**
 * How the details sheet says things. Spec 0005, AC-7 value sourcing.
 *
 * Every value here is formatted, never derived: the currency is fixed by spec
 * 0002, the timezone comes from the settings row through the grid, and a name
 * is looked up in the staff list the schedule read carries.
 */

/** Pesos with two decimals. The currency is a spec 0002 decision, not a setting. */
export function formatPeso(amount: number): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);
}

/** Everything but digits and a leading plus, for the `tel:` link. The text stays as typed. */
export function telHref(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

/** Who a user id is. The foreign key means a miss should not happen; it still reads sensibly. */
export function staffDisplayName(staff: readonly StaffName[], userId: string | null): string {
  if (!userId) return "a staff member";
  const match = staff.find((row) => row.userId === userId);
  return match ? firstName(match.displayName) : "a staff member";
}

/** The first word of a full name. Display only: the stored `display_name` is never shortened. */
export function firstName(name: string): string {
  return name.split(" ")[0];
}

/** "4pm to 6pm", in the venue's zone, in the grid's own compact labels. */
export function formatRange(startsAt: string, endsAt: string, timeZone: string): string {
  return `${formatSlotLabel(localTimeInZone(startsAt, timeZone))} to ${formatSlotLabel(localEndTimeInZone(endsAt, timeZone))}`;
}

/** The venue day an instant falls on, as the day navigation would head it. */
export function formatDayOf(instant: string, timeZone: string): string {
  return formatDay(calendarDateInZone(new Date(instant), timeZone), timeZone);
}

/** "Wed 16 Sep", the same heading the day navigation shows. */
export function formatDay(date: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** "16 Sep, 4:05 pm": when something was written, at the venue. */
export function formatStamp(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(instant));
}

export const PAYMENT_LABEL: Record<StaffReservation["paymentStatus"], string> = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
  waived: "Waived",
};
