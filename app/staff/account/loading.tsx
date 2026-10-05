import { AccountShell } from "@/components/auth/account-shell";
import { SectionCardSkeleton } from "@/components/section-card";

/** The sections' shape while the session and staff row are read. Spec 0004 (revised), AC-9. */
export default function Loading() {
  return (
    <AccountShell>
      <p role="status" className="sr-only">
        Loading your account
      </p>
      <SectionCardSkeleton rows={4} />
      <SectionCardSkeleton rows={3} />
      <SectionCardSkeleton rows={1} />
    </AccountShell>
  );
}
