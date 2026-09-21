import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BoardNotice } from "@/components/board-notice";
import { InvitePanel } from "@/components/staff/invite-panel";
import { UsersError } from "@/components/staff/users-error";
import { UsersPanel } from "@/components/staff/users-panel";
import { UsersShell } from "@/components/staff/users-shell";
import { currentSession } from "@/lib/auth/session";
import { canManageStaffRoles } from "@/lib/schedule/constants";
import { currentStaff, getAllStaff, getPendingInvites } from "@/lib/staff";
import { VENUE_NAME } from "@/lib/venue";

/**
 * The owner's and superadmin's user management screen. Spec 0012, AC-1 and
 * AC-2, revised so owner carries the same power as superadmin.
 *
 * `proxy.ts` has already sent a signed out visitor to `/sign-in`. Of the
 * signed in, only an active owner or superadmin stays: anybody else is sent
 * to `/staff` before the staff list read happens, the same courtesy redirect
 * `/staff/settings` gives. That redirect is a courtesy; `update_staff_role()`
 * refusing anyone else is what actually enforces this.
 *
 * Under the staff list sits the links panel (spec 0004, AC-3): one time
 * invite and reset links, made and revoked here, listed while pending.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff accounts",
  description: `Roles and access for ${VENUE_NAME}.`,
  robots: { index: false, follow: false },
};

export default async function UsersPage() {
  const current = await currentStaff();

  if (current.kind === "signed_out") redirect("/sign-in");

  if (current.kind === "error") {
    return (
      <BoardNotice heading="Staff accounts" icon={CircleAlert} title="Could not load your account">
        The venue database did not answer in time. Reload in a moment, and if it keeps happening
        tell Ella.
      </BoardNotice>
    );
  }

  if (!current.staff.isActive || !canManageStaffRoles(current.staff.role)) redirect("/staff");

  const [session, result, links] = await Promise.all([
    currentSession(),
    getAllStaff(),
    getPendingInvites(),
  ]);
  const userId = session?.user.id ?? "";

  return (
    <UsersShell>
      {result.ok ? (
        <>
          <UsersPanel initial={result.data} viewerUserId={userId} />
          {links.ok ? (
            <InvitePanel initial={links.data} staff={result.data} viewerUserId={userId} />
          ) : (
            <UsersError message={links.error.message} />
          )}
        </>
      ) : (
        <UsersError message={result.error.message} />
      )}
    </UsersShell>
  );
}
