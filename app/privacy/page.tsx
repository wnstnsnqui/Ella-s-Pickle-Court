import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { LegalPage, LegalSection } from "@/components/legal-page";
import {
  CLIENT_HASH_RETENTION_DAYS,
  EMAIL_RETENTION_DAYS,
  PHONE_RETENTION_DAYS,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_NOTICE_VERSION,
  PROOF_RETENTION_DAYS_AFTER_DECISION,
  PROOF_RETENTION_DAYS_UNCHECKED,
  PROOF_RETENTION_DAYS_UNSUBMITTED,
  REFERENCE_RETENTION_DAYS,
  VENUE_ADDRESS,
  VENUE_LEGAL_NAME,
} from "@/lib/legal/constants";
import { VENUE_NAME } from "@/lib/venue";

/**
 * Spec 0010, AC-1, and spec 0015, AC-22. Public, indexable, and read only: no
 * data is read to render it. Every fact comes from `lib/legal/constants.ts`,
 * so the page cannot drift from what `purge_customer_phones()`,
 * `purge_online_booking_details()` and the proof purge actually enforce.
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

        <LegalSection heading="What we collect when you book online">
          <p>
            When you book on this site you give us your name, mobile number and email, so we can
            hold your court and reach you about the booking. We never use your email for marketing.
          </p>
          <p>
            To pay, you send a GCash transfer and give us the last 4 digits of its reference number
            and a screenshot of the transfer, so staff can match your payment to your booking. The
            screenshot may show your name, account number or balance, so it is stored privately:
            only our staff can open it, and never from a public page.
          </p>
          <p>
            To keep bots from holding every court, the booking form runs a Cloudflare Turnstile
            check, and we keep a scrambled (hashed) form of your connection&apos;s address to limit
            how many bookings one connection can start in a short time.
          </p>
          <p>
            When you look up a booking by its code, a wrong code records the same one way hash of
            your connection for {CLIENT_HASH_RETENTION_DAYS} day, so nobody can guess their way to
            somebody else&apos;s booking.
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
            A customer&apos;s name, phone number, email, note, payment amount, reference digits or
            payment screenshot is never sent to PostHog and never shown on the public board. Online
            bookings are counted in PostHog without any of these, and without a cookie.
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

        <LegalSection heading="How long we keep online booking details">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Your email is cleared {EMAIL_RETENTION_DAYS} days after your last booked hour ends,
              and your mobile number after {PHONE_RETENTION_DAYS} days, the same as a desk booking.
            </li>
            <li>
              The last 4 digits of your transfer&apos;s reference number are cleared{" "}
              {REFERENCE_RETENTION_DAYS} days after your last booked hour ends. Any note our staff
              wrote when checking your payment is cleared at the same time.
            </li>
            <li>
              Your payment screenshot is deleted {PROOF_RETENTION_DAYS_AFTER_DECISION} days after
              staff check it. If it is never checked, it is deleted {PROOF_RETENTION_DAYS_UNCHECKED}{" "}
              days after your last booked hour ends. If you never confirmed the booking, it is
              deleted {PROOF_RETENTION_DAYS_UNSUBMITTED} day after your hold.
            </li>
            <li>
              The hashed connection address is cleared {CLIENT_HASH_RETENTION_DAYS} day after you
              start the booking.
            </li>
          </ul>
          <p>
            Your booking code, name, courts, hours and amount are kept for our own usage records.
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
