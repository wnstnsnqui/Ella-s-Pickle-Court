"use client";

import { Pencil, Users } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/schedule/empty-state";
import { firstName } from "@/components/staff/format";
import { Button } from "@/components/ui/button";
import type { StaffRole } from "@/lib/schedule/constants";
import { withRetry } from "@/lib/schedule/retry";
import type { StaffAccount } from "@/lib/staff";
import { refreshAllStaff, updateStaffRole } from "@/lib/staff/actions";
import { formatAtVenue } from "@/lib/time";

import { roleLabel } from "./roles";
import { UserSheet } from "./user-sheet";

/**
 * The signed in owner's or superadmin's own state and every write it makes.
 * Spec 0012, AC-3 to AC-9.
 *
 * It holds the staff list the page last read, with each row's version, and
 * sends that version with every write. There is no live subscription: after a
 * write it refetches, and a `version_stale` answer replaces the rows and says
 * so, mirroring `SettingsPanel`.
 *
 * `UserSheet`, opened deliberately from a row's edit button rather than a
 * directly clickable control, is the whole flow: Save applies the change,
 * no separate confirm step (a revision from the two step flow this feature
 * first shipped with).
 */

const STALE_MESSAGE = "Somebody else changed that account. Showing the fresh list.";
const DROPPED_MESSAGE = "The change did not go through. Check the connection.";

export function UsersPanel({
  initial,
  viewerClerkUserId,
}: {
  initial: StaffAccount[];
  viewerClerkUserId: string;
}) {
  const [staff, setStaff] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [sheetAccount, setSheetAccount] = useState<StaffAccount | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const superadminCount = staff.filter((row) => row.role === "superadmin").length;

  const refetch = useCallback(async () => {
    const result = await refreshAllStaff();
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setStaff(result.data);
  }, []);

  const openEdit = (target: StaffAccount, opener: HTMLElement) => {
    openerRef.current = opener;
    setSheetAccount(target);
  };

  const saveChange = async (newRole: StaffRole, newIsActive: boolean) => {
    const target = sheetAccount;
    if (!target) return;
    setBusy(true);
    let result: Awaited<ReturnType<typeof updateStaffRole>>;
    try {
      result = await withRetry(() =>
        updateStaffRole({
          clerkUserId: target.clerkUserId,
          role: newRole,
          isActive: newIsActive,
          version: target.version,
        }),
      );
    } catch {
      setBusy(false);
      toast.error(DROPPED_MESSAGE);
      return;
    }

    if (result.ok) {
      await refetch();
      setBusy(false);
      setSheetAccount(null);
      toast.success(`${firstName(target.displayName)} updated.`);
      return;
    }

    setBusy(false);
    const { error } = result;
    if (error.kind === "conflict" && error.reason === "version_stale") {
      await refetch();
      setSheetAccount(null);
      toast.info(STALE_MESSAGE);
      return;
    }
    // A rare race (someone else changed this account, or a role changed
    // under an open tab): the sheet stays open so the attempted values
    // are not lost, and the refusal is said plainly.
    toast.error(error.message);
  };

  if (staff.length === 0) {
    return (
      <EmptyState icon={Users} title="No staff accounts yet" body="Nobody has signed in yet." />
    );
  }

  return (
    <div className="border-border bg-card rounded-lg border p-4 sm:p-6">
      <ol className="divide-border divide-y">
        {staff.map((row) => {
          const isSelf = row.clerkUserId === viewerClerkUserId;
          return (
            <li
              key={row.clerkUserId}
              className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-label truncate">{firstName(row.displayName)}</p>
                <p className="text-caption text-muted-foreground truncate">
                  {row.email ?? "No email on file"}
                  {row.lastSignedInAt
                    ? ` · Last signed in ${formatAtVenue(row.lastSignedInAt, { dateStyle: "medium", timeStyle: "short" })}`
                    : " · Never signed in"}
                </p>
              </div>
              {isSelf ? (
                <p className="text-label shrink-0">
                  {roleLabel(row.role)} · {row.isActive ? "Active" : "Deactivated"}
                </p>
              ) : (
                <div className="flex shrink-0 items-center gap-1">
                  <p className="text-label">
                    {roleLabel(row.role)} · {row.isActive ? "Active" : "Deactivated"}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    onClick={(event) => openEdit(row, event.currentTarget)}
                  >
                    <Pencil aria-hidden="true" />
                    <span className="sr-only">Edit {firstName(row.displayName)}</span>
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <UserSheet
        open={sheetAccount !== null}
        onOpenChange={(open) => {
          if (!open) setSheetAccount(null);
        }}
        account={sheetAccount}
        superadminCount={superadminCount}
        pending={busy}
        onSubmit={(role, isActive) => void saveChange(role, isActive)}
        returnFocusTo={openerRef}
      />
    </div>
  );
}
