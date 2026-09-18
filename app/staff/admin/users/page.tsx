import { auth } from "@clerk/nextjs/server";
import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BoardNotice } from "@/components/board-notice";
import { UsersError } from "@/components/staff/users-error";
import { UsersPanel } from "@/components/staff/users-panel";
import { UsersShell } from "@/components/staff/users-shell";
import { canManageStaffRoles } from "@/lib/schedule/constants";
import { currentStaff, getAllStaff } from "@/lib/staff";
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

  const { userId } = await auth();
  const result = await getAllStaff();

  return (
    <UsersShell>
      {result.ok ? (
        <UsersPanel initial={result.data} viewerClerkUserId={userId ?? ""} />
      ) : (
        <UsersError message={result.error.message} />
      )}
    </UsersShell>
  );
}
