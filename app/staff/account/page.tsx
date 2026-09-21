import { CircleAlert, KeyRound, MonitorSmartphone, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountShell } from "@/components/auth/account-shell";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { NameForm } from "@/components/auth/name-form";
import { OtherDevices } from "@/components/auth/other-devices";
import { BoardNotice } from "@/components/board-notice";
import { SettingsSection } from "@/components/settings/settings-section";
import { SignOutButton } from "@/components/staff-controls";
import { roleLabel } from "@/components/staff/roles";
import { currentSession } from "@/lib/auth/session";
import { currentStaff } from "@/lib/staff";
import { formatAtVenue } from "@/lib/time";
import { VENUE_NAME } from "@/lib/venue";

/**
 * The signed in person's own page. Spec 0004 (revised), AC-9.
 *
 * `proxy.ts` has already sent a signed out visitor to `/sign-in`. Every
 * active staff member may be here, whatever their role: this page only ever
 * touches its own Better Auth user. The name is the one thing the person
 * can change that the board shows; username and role are read only (the
 * username is what invites, the `staff` row and sign in itself key on, and a
 * role is the owner's to set on `/staff/admin/users`).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your account",
  description: `Your staff account at ${VENUE_NAME}.`,
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const [current, session] = await Promise.all([currentStaff(), currentSession()]);

  if (current.kind === "signed_out" || !session) redirect("/sign-in");

  if (current.kind === "error") {
    return (
      <BoardNotice heading="Your account" icon={CircleAlert} title="Could not load your account">
        The venue database did not answer in time. Reload in a moment, and if it keeps happening
        tell Ella.
      </BoardNotice>
    );
  }

  if (!current.staff.isActive) redirect("/staff");

  return (
    <AccountShell>
      <SettingsSection
        id="details"
        icon={UserRound}
        title="Details"
        description="Your name is yours to change. Ask Ella about anything else."
        action={<SignOutButton variant="outline" />}
      >
        <dl className="border-border mb-6 grid gap-4 border-b pb-6 sm:grid-cols-3">
          <Detail label="Username">{session.user.username ?? "None yet"}</Detail>
          <Detail label="Role">{roleLabel(current.staff.role)}</Detail>
          <Detail label="Staff since">
            {formatAtVenue(session.user.createdAt, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </Detail>
        </dl>
        <NameForm initialName={session.user.name} />
      </SettingsSection>

      <SettingsSection
        id="password"
        icon={KeyRound}
        title="Password"
        description="Changing it signs every other device out."
      >
        <ChangePasswordForm />
      </SettingsSection>

      <SettingsSection
        id="devices"
        icon={MonitorSmartphone}
        title="Other devices"
        description="Every place you are signed in besides this one."
      >
        <OtherDevices />
      </SettingsSection>
    </AccountShell>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-body mt-0.5 truncate font-medium">{children}</dd>
    </div>
  );
}
