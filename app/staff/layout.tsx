import { StaffIdentity } from "@/components/analytics/staff-identity";
import { PrivacyNoticeDialog } from "@/components/staff/privacy-notice-dialog";
import { currentSession } from "@/lib/auth/session";
import { PRIVACY_NOTICE_VERSION } from "@/lib/legal/constants";
import { currentStaff } from "@/lib/staff";

/**
 * Identifies a signed in staff member to PostHog (spec 0009, AC-3) and gates
 * every route under `/staff` behind the one time privacy acknowledgement
 * (spec 0010, AC-10).
 *
 * `proxy.ts` already protects every path under `/staff`; this layout adds
 * nothing to that guard, and every page below keeps its own `currentStaff()`
 * check for what it renders. `currentStaff()` is wrapped in React `cache()`,
 * so reading it again here costs no second database round trip.
 *
 * The dialog's `open` prop is computed here, not owned by the dialog: a
 * signed in, active staff member whose stored version does not match the
 * current constant sees it, every render, until `acknowledgePrivacyNotice()`
 * succeeds and `router.refresh()` re-runs this layout with a fresh answer.
 */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const [session, staff] = await Promise.all([currentSession(), currentStaff()]);
  const userId = session?.user.id;
  const active =
    userId && staff.kind === "ok" && staff.staff.isActive ? { userId, staff: staff.staff } : null;

  return (
    <>
      {active && (
        <StaffIdentity
          id={active.userId}
          displayName={active.staff.displayName}
          role={active.staff.role}
        />
      )}
      {active && (
        <PrivacyNoticeDialog
          open={active.staff.privacyAcknowledgedVersion !== PRIVACY_NOTICE_VERSION}
          noticeVersion={PRIVACY_NOTICE_VERSION}
        />
      )}
      {children}
    </>
  );
}
