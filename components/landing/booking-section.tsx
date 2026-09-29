import type { Schedule } from "@/lib/schedule/queries";

import { BookingPicker } from "./booking-picker";
import { BOOKING_SECTION } from "./content";
import { SectionHeading } from "./section-heading";

/**
 * The court booking section. Spec 0013, AC-3 to AC-14.
 *
 * Today is read once on the server by the page and handed down; the picker in
 * the browser reads any other day itself. `initial` is null when that read
 * failed or was skipped over the rate limit, and the picker takes it from
 * there without ever showing an error.
 */
export function BookingSection({
  initial,
  limited,
}: {
  initial: Schedule | null;
  limited: boolean;
}) {
  return (
    <section
      id="book"
      aria-labelledby="book-title"
      className="bg-muted scroll-mt-16 py-20 md:py-28"
    >
      <div className="mx-auto w-full max-w-6xl px-4">
        <SectionHeading
          id="book-title"
          eyebrow={BOOKING_SECTION.eyebrow}
          title={BOOKING_SECTION.title}
        >
          {BOOKING_SECTION.lede}
        </SectionHeading>
        <div data-reveal className="mt-12">
          <BookingPicker initial={initial} limited={limited} />
        </div>
      </div>
    </section>
  );
}
