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

import { ConfirmDialog } from "./confirm-dialog";
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
 * Editing is two steps: `UserSheet` collects the new role and active flag
 * behind a Continue button, then `ConfirmDialog` spells the change out and
 * asks before the write. Backing out of the dialog returns to the sheet
 * with the edits intact; a refusal shows inside the dialog for the same
 * reason.
 */

const STALE_MESSAGE = "Somebody else changed that account. Showing the fresh list.";
const DROPPED_MESSAGE = "The change did not go through. Check the connection.";

type ProposedChange = { role: StaffRole; isActive: boolean };

function hasChanged(target: StaffAccount, change: ProposedChange): boolean {
  return change.role !== target.role || change.isActive !== target.isActive;
}

/**
 * The lines the confirm dialog reads out: one per field that changed. With
 * nothing changed the dialog says so and offers only Go back.
 */
function describeChange(
  target: StaffAccount,
  change: ProposedChange,
  currentOwner: StaffAccount | null,
): string {
  const lines: string[] = [];
  if (change.role !== target.role) {
    lines.push(`Role: ${roleLabel(target.role)} → ${roleLabel(change.role)}.`);
    if (change.role === "owner" && currentOwner && currentOwner.userId !== target.userId) {
      lines.push(`${firstName(currentOwner.displayName)} will become Admin at the same time.`);
    }
  }
  if (change.isActive !== target.isActive) {
    lines.push(
      change.isActive
        ? "They will be able to sign in again."
        : "They will keep their account but will not be able to sign in.",
    );
  }
  if (lines.length === 0) return "Nothing has changed.";
  return lines.join(" ");
}

export function UsersPanel({
  initial,
  viewerUserId,
}: {
  initial: StaffAccount[];
  viewerUserId: string;
}) {
  const [staff, setStaff] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [sheetAccount, setSheetAccount] = useState<StaffAccount | null>(null);
  const [proposed, setProposed] = useState<ProposedChange | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const superadminCount = staff.filter((row) => row.role === "superadmin").length;
  const currentOwner = staff.find((row) => row.role === "owner") ?? null;

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

  const closeSheet = () => {
    setProposed(null);
    setConfirmError(null);
    setSheetAccount(null);
  };

  const saveChange = async () => {
    const target = sheetAccount;
    const change = proposed;
    if (!target || !change) return;
    setBusy(true);
    setConfirmError(null);
    let result: Awaited<ReturnType<typeof updateStaffRole>>;
    try {
      result = await withRetry(() =>
        updateStaffRole({
          userId: target.userId,
          role: change.role,
          isActive: change.isActive,
          version: target.version,
        }),
      );
    } catch {
      setBusy(false);
      setConfirmError(DROPPED_MESSAGE);
      return;
    }

    if (result.ok) {
      await refetch();
      setBusy(false);
      closeSheet();
      toast.success(`${firstName(target.displayName)} updated.`);
      return;
    }

    setBusy(false);
    const { error } = result;
    if (error.kind === "conflict" && error.reason === "version_stale") {
      await refetch();
      closeSheet();
      toast.info(STALE_MESSAGE);
      return;
    }
    // A rare race (someone else changed this account, or a role changed
    // under an open tab): the dialog stays open with the refusal inside it,
    // and the sheet underneath keeps the attempted values.
    setConfirmError(error.message);
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
          const isSelf = row.userId === viewerUserId;
          return (
            <li
              key={row.userId}
              className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-label truncate">{firstName(row.displayName)}</p>
                <p className="text-caption text-muted-foreground truncate">
                  {row.username ?? "No username on file"}
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
          if (!open) closeSheet();
        }}
        account={sheetAccount}
        superadminCount={superadminCount}
        pending={busy}
        onSubmit={(role, isActive) => setProposed({ role, isActive })}
        returnFocusTo={openerRef}
      />

      <ConfirmDialog
        open={proposed !== null}
        onOpenChange={(open) => {
          if (!open) {
            setProposed(null);
            setConfirmError(null);
          }
        }}
        title={sheetAccount ? `Save changes to ${firstName(sheetAccount.displayName)}?` : ""}
        description={
          sheetAccount && proposed ? describeChange(sheetAccount, proposed, currentOwner) : ""
        }
        keepLabel="Go back"
        confirmLabel={
          sheetAccount && proposed && hasChanged(sheetAccount, proposed) ? "Save" : undefined
        }
        confirmVariant={
          sheetAccount?.isActive && proposed && !proposed.isActive ? "destructive" : "default"
        }
        error={confirmError}
        pending={busy}
        onConfirm={() => void saveChange()}
      />
    </div>
  );
}
