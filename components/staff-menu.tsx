import { CalendarDays, CircleAlert, UserRoundX } from "lucide-react";
import Link from "next/link";

import { AccountButton, SignOutButton } from "@/components/staff-controls";
import { Button } from "@/components/ui/button";
import { currentStaff } from "@/lib/staff";

/**
 * What a signed in person sees in the shell's `staff` slot. Spec 0004, AC-4,
 * AC-5 and AC-8.
 *
 * A server component with one input, `currentStaff()`, and a rendering for each
 * of its answers: the name and a sign out button; the switched off notice and a
 * sign out button; or the could not load notice and a sign out button. Sign out
 * is always there, because a person stuck on a shared tablet must always be able
 * to leave.
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
        <SignOutButton />
      </>
    );
  }

  if (!current.staff.isActive) {
    return (
      <>
        <StaffNotice icon={UserRoundX}>Your account is switched off</StaffNotice>
        <SignOutButton />
      </>
    );
  }

  return (
    <>
      {/* The way to the staff board from anywhere else (spec 0005, AC-1). Icon
          only on a phone, where the band has no room for four labels. */}
      <Button asChild variant="ghost" size="sm" title="Schedule">
        <Link href="/staff">
          <CalendarDays aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Schedule</span>
        </Link>
      </Button>
      <AccountButton name={current.staff.displayName} />
      <SignOutButton />
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
