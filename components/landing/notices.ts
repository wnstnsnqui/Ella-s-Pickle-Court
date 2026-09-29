import { toast } from "sonner";

import { smsHref, VENUE_MESSENGER_URL } from "@/lib/venue";

/**
 * The landing page's two toasts. Spec 0013, AC-9 and AC-13.
 *
 * The failure toast is the only place a visitor ever reads that something
 * went wrong (AC-10), so its words are fixed here once.
 */

export const READ_FAILED_MESSAGE = "We couldn't load the live schedule. Message us to book.";

export function showReadFailedToast(): void {
  toast(READ_FAILED_MESSAGE);
}

/**
 * "Request booking" books nothing yet, and says so (AC-13): the picks stay
 * put, and the toast hands them to Messenger or to a prefilled text.
 */
export function showComingSoonToast(body: string): void {
  toast("Online booking is coming soon", {
    id: "landing-coming-soon",
    description: "Message us and we'll book it for you.",
    duration: 12_000,
    action: {
      label: "Messenger",
      onClick: () => window.open(VENUE_MESSENGER_URL, "_blank", "noopener,noreferrer"),
    },
    cancel: {
      label: "Text us",
      onClick: () => window.location.assign(smsHref(body)),
    },
  });
}
