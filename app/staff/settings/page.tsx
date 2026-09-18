import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BoardNotice } from "@/components/board-notice";
import { SettingsError } from "@/components/settings/settings-error";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { SettingsShell } from "@/components/settings/settings-shell";
import { isOwnerLevel } from "@/lib/schedule/constants";
import { getOwnerSettings } from "@/lib/schedule/queries";
import { currentStaff } from "@/lib/staff";
import { VENUE_NAME } from "@/lib/venue";

/**
 * The owner's settings page. Spec 0007, AC-1 and AC-2.
 *
 * `proxy.ts` has already sent a signed out visitor to `/sign-in`. Of the
 * signed in, only an active owner, admin or superadmin stays (spec 0012,
 * AC-12): anybody else is sent to `/staff` before the settings read happens.
 * That redirect is a courtesy; the policies on `court` and `venue_settings`
 * are what refuse anyone else's write.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
  description: `Courts and opening hours for ${VENUE_NAME}.`,
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const current = await currentStaff();

  if (current.kind === "signed_out") redirect("/sign-in");

  if (current.kind === "error") {
    return (
      <BoardNotice heading="Settings" icon={CircleAlert} title="Could not load your account">
        The venue database did not answer in time. Reload in a moment, and if it keeps happening
        tell Ella.
      </BoardNotice>
    );
  }

  if (!current.staff.isActive || !isOwnerLevel(current.staff.role)) redirect("/staff");

  const result = await getOwnerSettings();

  return (
    <SettingsShell>
      {result.ok ? (
        <SettingsPanel initial={result.data} />
      ) : (
        <SettingsError message={result.error.message} />
      )}
    </SettingsShell>
  );
}
