"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";

import { BoardSheet } from "@/components/board-sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { STAFF_ROLES, type StaffRole } from "@/lib/schedule/constants";
import type { StaffAccount } from "@/lib/staff";
import { formatAtVenue } from "@/lib/time";

import { roleLabel, superadminOptionDisabled } from "./roles";

/**
 * Edit one staff account: their details, then their role and active flag.
 * Spec 0012, AC-3 and AC-4. Mirrors `CourtSheet`'s shape, the same side sheet
 * editing courts already uses.
 *
 * Save applies the change directly, no separate confirm step: the sheet
 * itself, opened deliberately from a row's edit button rather than a
 * directly clickable control, is judged enough of a deliberate act on its
 * own (a revision from the two step flow this feature first shipped with).
 * The role and active flag start from the account passed in; the form is
 * keyed on its Clerk id and version, so a different account, or the same one
 * refreshed after a write, always opens with its own current values.
 */
export function UserSheet({
  open,
  onOpenChange,
  account,
  superadminCount,
  pending,
  onSubmit,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The account being edited. Null only while the sheet is closing. */
  account: StaffAccount | null;
  superadminCount: number;
  pending: boolean;
  onSubmit: (role: StaffRole, isActive: boolean) => void;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}) {
  return (
    <BoardSheet
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={account ? `Edit ${account.displayName}` : "Edit account"}
      description="Change their role or active flag, then save."
      footer={
        <Button type="submit" form="user-form" disabled={pending} className="w-full">
          {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
          {pending ? "Saving" : "Save"}
        </Button>
      }
    >
      {account ? (
        <UserForm
          key={`${account.clerkUserId}:${account.version}`}
          account={account}
          superadminCount={superadminCount}
          onSubmit={onSubmit}
        />
      ) : null}
    </BoardSheet>
  );
}

function UserForm({
  account,
  superadminCount,
  onSubmit,
}: {
  account: StaffAccount;
  superadminCount: number;
  onSubmit: (role: StaffRole, isActive: boolean) => void;
}) {
  const [role, setRole] = useState<StaffRole>(account.role);
  const [isActive, setIsActive] = useState(account.isActive);

  return (
    <form
      id="user-form"
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(role, isActive);
      }}
    >
      <div className="flex flex-col gap-2">
        <Label>Email</Label>
        <p className="text-body text-muted-foreground">{account.email ?? "No email on file"}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="user-role">Role</Label>
        <Select value={role} onValueChange={(value) => setRole(value as StaffRole)}>
          <SelectTrigger id="user-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAFF_ROLES.map((candidate) => (
              <SelectItem
                key={candidate}
                value={candidate}
                disabled={
                  candidate === "superadmin" &&
                  superadminOptionDisabled(account.role, superadminCount)
                }
              >
                {roleLabel(candidate)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="user-active">Deactivate</Label>
          <p className="text-caption text-muted-foreground">
            Deactivated, they keep their account but cannot sign in.
          </p>
        </div>
        <Switch id="user-active" checked={isActive} onCheckedChange={setIsActive} />
      </div>

      <p className="text-caption text-muted-foreground">
        {account.lastSignedInAt
          ? `Last signed in ${formatAtVenue(account.lastSignedInAt, { dateStyle: "medium", timeStyle: "short" })}`
          : "Never signed in"}
      </p>
    </form>
  );
}
