import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { PRIVACY_CONTACT_EMAIL, PRIVACY_NOTICE_VERSION } from "@/lib/legal/constants";
import { VENUE_NAME } from "@/lib/venue";

/** Spec 0010, AC-2. Public, indexable, and read only. */
export const metadata: Metadata = {
  title: "Terms of use",
  description: `The terms for using the ${VENUE_NAME} court schedule.`,
};

export default function TermsPage() {
  return (
    <AppShell>
      <LegalPage title="Terms of use" noticeVersion={PRIVACY_NOTICE_VERSION}>
        <LegalSection heading="What this board is">
          <p>
            The board is a live view of court availability at the moment you look at it. A court
            shown Available is not guaranteed to still be free by the time you arrive.
          </p>
        </LegalSection>

        <LegalSection heading="What this site does not do">
          <p>
            The site takes no bookings and no payments. A booking is made in person or by phone.
          </p>
        </LegalSection>

        <LegalSection heading="Staff accounts">
          <p>Staff accounts are for {VENUE_NAME}&apos;s authorised staff only.</p>
        </LegalSection>

        <LegalSection heading="Acceptable use">
          <p>
            Anyone may read the board. Automated or repeated reading is rate limited and may be
            refused.
          </p>
        </LegalSection>

        <LegalSection heading="Changes to these terms">
          <p>
            We may change these terms. The date at the top of this page shows when it was last
            updated.
          </p>
        </LegalSection>

        <LegalSection heading="Governing law">
          <p>These terms are governed by the law of the Philippines.</p>
        </LegalSection>

        <LegalSection heading="Contact">
          <p>
            Questions about these terms:{" "}
            <a
              href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
              className="text-foreground rounded-sm underline-offset-4 hover:underline"
            >
              {PRIVACY_CONTACT_EMAIL}
            </a>
            .
          </p>
        </LegalSection>
      </LegalPage>
    </AppShell>
  );
}
