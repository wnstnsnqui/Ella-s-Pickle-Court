import { CalendarDays, ChartColumn, CircleAlert, Settings2, UserRoundX, Users } from "lucide-react";
import Link from "next/link";

import { AccountButton, SignOutButton } from "@/components/staff-controls";
import { Button } from "@/components/ui/button";
import { canManageStaffRoles, isOwnerLevel } from "@/lib/schedule/constants";
import { currentStaff } from "@/lib/staff";

/**
 * What a signed in person sees in the shell's `staff` slot. Spec 0004, AC-4,
 * AC-5 and AC-8.
 *
 * A server component with one input, `currentStaff()`, and a rendering for each
 * of its answers: the page links and the name, which leads to the account page
 * where Sign out lives; the switched off notice and a sign out button; or the
 * could not load notice and a sign out button. Those two keep Sign out in the
 * header because they cannot reach the account page, and a person stuck on a
 * shared tablet must always be able to leave.
 *
 * The page wraps this in `<Suspense fallback={null}>` so the board streams
 * while the staff row is being created or refreshed (invariant 3a).
 */
export async function StaffMenu() {
  const current = await currentStaff();

  if (current.kind === "signed_out") return null;

  if (current.kind === "error") {
    return (
      <>
        <StaffNotice icon={CircleAlert}>Could not load your account</StaffNotice>
        <SignOutButton className="order-last" />
      </>
    );
  }

  if (!current.staff.isActive) {
    return (
      <>
        <StaffNotice icon={UserRoundX}>Your account is switched off</StaffNotice>
        <SignOutButton className="order-last" />
      </>
    );
  }

  return (
    <>
      {/* The way to the staff board from anywhere else (spec 0005, AC-1). */}
      <Button asChild variant="ghost" size="sm" title="Schedule">
        <Link href="/staff">
          <CalendarDays aria-hidden="true" />
          <span>Schedule</span>
        </Link>
      </Button>
      {/* Reports and Settings stand open to owner, admin and superadmin alike
          (spec 0008, AC-1; spec 0007, AC-1; spec 0012, AC-12). */}
      {isOwnerLevel(current.staff.role) ? (
        <>
          <Button asChild variant="ghost" size="sm" title="Reports">
            <Link href="/staff/reports">
              <ChartColumn aria-hidden="true" />
              <span>Reports</span>
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" title="Settings">
            <Link href="/staff/settings">
              <Settings2 aria-hidden="true" />
              <span>Settings</span>
            </Link>
          </Button>
        </>
      ) : null}
      {/* Owner and superadmin see the way to manage everyone's role. Spec 0012, AC-12. */}
      {canManageStaffRoles(current.staff.role) ? (
        <Button asChild variant="ghost" size="sm" title="Users">
          <Link href="/staff/admin/users">
            <Users aria-hidden="true" />
            <span>Users</span>
          </Link>
        </Button>
      ) : null}
      {/* Sign out is on the account page (spec 0004, AC-9), behind this. */}
      <AccountButton name={current.staff.displayName} />
    </>
  );
}

/** A short line on the brand band, with an icon so colour is never the only signal. */
function StaffNotice({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
}) {
  return (
    <p role="status" className="text-caption inline-flex items-center gap-1.5 px-1">
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
