"use client";

import { useEffect } from "react";

import { identifyStaff } from "@/lib/analytics/browser";
import type { StaffRole } from "@/lib/staff";

/**
 * Calls `posthog.identify()` once per page load under `/staff`. Spec 0009,
 * AC-3. Renders nothing; `app/staff/layout.tsx` renders it only for an
 * active staff member, so a switched off or missing row identifies nobody.
 */
export function StaffIdentity({
  id,
  displayName,
  role,
}: {
  id: string;
  displayName: string;
  role: StaffRole;
}) {
  useEffect(() => {
    identifyStaff({ id, displayName, role });
    // Deliberately once per page load, not on every re-render: identity does
    // not change mid session, and calling it again would only be redundant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
