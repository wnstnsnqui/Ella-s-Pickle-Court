import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { LegalPage, LegalSection } from "@/components/legal-page";
import {
  PHONE_RETENTION_DAYS,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_NOTICE_VERSION,
  VENUE_ADDRESS,
  VENUE_LEGAL_NAME,
} from "@/lib/legal/constants";
import { VENUE_NAME } from "@/lib/venue";

/**
 * Spec 0010, AC-1. Public, indexable, and read only: no data is read to
 * render it. Every fact comes from `lib/legal/constants.ts`, so the page
 * cannot drift from what `purge_customer_phones()` actually enforces.
 */
export const metadata: Metadata = {
  title: "Privacy notice",
  description: `What ${VENUE_NAME} records, why, and for how long.`,
};

export default function PrivacyPage() {
  return (
    <AppShell>
      <LegalPage title="Privacy notice" noticeVersion={PRIVACY_NOTICE_VERSION}>
        <LegalSection heading="Who holds this data">
          <p>
            {VENUE_LEGAL_NAME}, {VENUE_ADDRESS}, holds the data described on this page. You can
            reach us at{" "}
            <a
              href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
              className="text-foreground rounded-sm underline-offset-4 hover:underline"
            >
              {PRIVACY_CONTACT_EMAIL}
            </a>
            .
          </p>
        </LegalSection>

        <LegalSection heading="What we collect about a customer, and why">
          <p>
            When you book a court, a staff member records your name, phone number, an optional note,
            and whether and how much you have paid, so we can hold your court and reach you if
            something changes.
          </p>
        </LegalSection>

        <LegalSection heading="What we record about a visitor to the board">
          <p>
            Looking at the court schedule at {VENUE_NAME} does not put anything on your device: no
            cookie, no account, nothing stored locally. We do keep an anonymous, cookieless count of
            page views through our analytics tool, PostHog, so we know roughly how many people check
            the board. That count cannot be tied back to you.
          </p>
        </LegalSection>

        <LegalSection heading="What we record about staff">
          <p>
            A staff member&apos;s name, username and password (stored only as a hash) are held in
            our own database, and signing in sets a cookie on staff pages. Each sign in also records
            the device&apos;s IP address and browser type with the session, kept for up to 30 days
            and deleted when the session ends. Their account id, name and role are also sent to
            PostHog and kept in the browser&apos;s local storage while they use staff pages, so we
            can see how the tool is used.
          </p>
        </LegalSection>

        <LegalSection heading="What never leaves the booking database">
          <p>
            A customer&apos;s name, phone number, note, or payment amount is never sent to PostHog
            and never shown on the public board.
          </p>
        </LegalSection>

        <LegalSection heading="How long we keep a phone number">
          <p>
            A customer&apos;s phone number is cleared automatically, from the booking and from its
            change history, {PHONE_RETENTION_DAYS} days after the booking&apos;s scheduled end. The
            rest of the booking (the name, the court, the time, whether it was paid) is kept for our
            own usage records.
          </p>
        </LegalSection>

        <LegalSection heading="Asking to see, correct, or delete your details">
          <p>
            Email {PRIVACY_CONTACT_EMAIL} or ask at the front desk to see, correct, or ask us to
            remove your booking details. We answer within 30 days.
          </p>
        </LegalSection>
      </LegalPage>
    </AppShell>
  );
}
