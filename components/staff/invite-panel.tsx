"use client";

import { Check, Copy, KeyRound, Link2, LoaderCircle, Plus, UserPlus } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/schedule/empty-state";
import { firstName } from "@/components/staff/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { withRetry } from "@/lib/schedule/retry";
import type { PendingInvite, StaffAccount } from "@/lib/staff";
import { createStaffInvite, refreshPendingInvites, revokeStaffInvite } from "@/lib/staff/actions";
import { formatAtVenue } from "@/lib/time";

import { roleLabel } from "./roles";

/**
 * One time links, under the staff list on `/staff/admin/users`. Spec 0004
 * (revised), AC-3, AC-15.
 *
 * Make a link (an invite with a role, or a password reset for one active
 * account), see the full link exactly once with a Copy button, and revoke
 * anything still pending. Like `UsersPanel` there is no live subscription:
 * after every write the list is refetched, and a link somebody else already
 * used or revoked comes back as a plain notice with the fresh list.
 */

const INVITE_ROLES = ["staff", "admin", "superadmin"] as const;
type InviteRole = (typeof INVITE_ROLES)[number];
type LinkKind = "invite" | "reset";

const DROPPED_MESSAGE = "The change did not go through. Check the connection.";

export function InvitePanel({
  initial,
  staff,
  viewerUserId,
}: {
  initial: PendingInvite[];
  /** The staff list as the page read it, for the reset target picker and the superadmin cap. */
  staff: StaffAccount[];
  viewerUserId: string;
}) {
  const [links, setLinks] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [makeOpen, setMakeOpen] = useState(false);
  const [made, setMade] = useState<{ url: string; expiresAt: string; kind: LinkKind } | null>(null);

  const refetch = useCallback(async () => {
    const result = await refreshPendingInvites();
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setLinks(result.data);
  }, []);

  const revoke = async (link: PendingInvite) => {
    setBusyId(link.id);
    let result: Awaited<ReturnType<typeof revokeStaffInvite>>;
    try {
      result = await withRetry(() => revokeStaffInvite({ id: link.id, kind: link.kind }));
    } catch {
      setBusyId(null);
      toast.error(DROPPED_MESSAGE);
      return;
    }
    await refetch();
    setBusyId(null);
    if (result.ok) {
      toast.success("Link revoked.");
      return;
    }
    if (result.error.kind === "conflict") {
      toast.info(result.error.message);
      return;
    }
    toast.error(result.error.message);
  };

  return (
    <section aria-labelledby="links-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="links-heading" className="text-title">
            Links
          </h2>
          <p className="text-body text-muted-foreground mt-1">
            An invite creates an account with the role you choose. A reset lets someone set a new
            password. Each link works once and for seven days.
          </p>
        </div>
        <Button type="button" onClick={() => setMakeOpen(true)}>
          <Plus aria-hidden="true" />
          Make a link
        </Button>
      </div>

      {links.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No links waiting"
          body="A link disappears from here once it is opened, revoked or seven days old. If someone's sign up failed after they opened their link, it is spent: make them a new one."
        />
      ) : (
        <div className="border-border bg-card rounded-lg border p-4 sm:p-6">
          <ol className="divide-border divide-y">
            {links.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <Badge variant={link.kind === "invite" ? "default" : "secondary"}>
                  {link.kind === "invite" ? (
                    <UserPlus aria-hidden="true" />
                  ) : (
                    <KeyRound aria-hidden="true" />
                  )}
                  {link.kind === "invite" ? "Invite" : "Reset"}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-label truncate">
                    {link.kind === "invite"
                      ? `${roleLabel(link.role ?? "staff")} account`
                      : `For ${firstName(link.targetDisplayName ?? "a staff member")}`}
                  </p>
                  <p className="text-caption text-muted-foreground truncate">
                    Made by {firstName(link.createdByDisplayName)} · Expires{" "}
                    {formatAtVenue(link.expiresAt, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => void revoke(link)}
                >
                  {busyId === link.id ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : null}
                  Revoke
                </Button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <MakeLinkDialog
        open={makeOpen}
        onOpenChange={setMakeOpen}
        staff={staff}
        viewerUserId={viewerUserId}
        onMade={async (link) => {
          setMakeOpen(false);
          setMade(link);
          await refetch();
        }}
      />
      <ShowLinkDialog link={made} onClose={() => setMade(null)} />
    </section>
  );
}

function MakeLinkDialog({
  open,
  onOpenChange,
  staff,
  viewerUserId,
  onMade,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffAccount[];
  viewerUserId: string;
  onMade: (link: { url: string; expiresAt: string; kind: LinkKind }) => Promise<void>;
}) {
  const [kind, setKind] = useState<LinkKind>("invite");
  const [role, setRole] = useState<InviteRole>("staff");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const superadminFull = staff.filter((row) => row.role === "superadmin").length >= 2;
  const targets = staff.filter((row) => row.isActive && row.userId !== viewerUserId);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (kind === "reset" && !targetUserId) {
      setError("Choose whose password to reset.");
      return;
    }
    setPending(true);
    let result: Awaited<ReturnType<typeof createStaffInvite>>;
    try {
      result = await withRetry(() =>
        createStaffInvite(kind === "invite" ? { kind, role } : { kind, targetUserId }),
      );
    } catch {
      setPending(false);
      setError(DROPPED_MESSAGE);
      return;
    }
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await onMade({ ...result.data, kind });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Make a link</DialogTitle>
            <DialogDescription>
              You will see the link once. Send it however you like; it works for one person, once.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="link-kind">What for</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as LinkKind)}>
              <SelectTrigger id="link-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="invite">A new account</SelectItem>
                <SelectItem value="reset" disabled={targets.length === 0}>
                  A password reset
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {kind === "invite" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="link-role">Role</Label>
              <Select value={role} onValueChange={(value) => setRole(value as InviteRole)}>
                <SelectTrigger id="link-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVITE_ROLES.map((candidate) => (
                    <SelectItem
                      key={candidate}
                      value={candidate}
                      disabled={candidate === "superadmin" && superadminFull}
                    >
                      {roleLabel(candidate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-muted-foreground">
                Owner is never given by link; it moves only through a transfer on this screen.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="link-target">Whose password</Label>
              <Select value={targetUserId} onValueChange={setTargetUserId}>
                <SelectTrigger id="link-target" className="w-full">
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((row) => (
                    <SelectItem key={row.userId} value={row.userId}>
                      {row.displayName}
                      {row.username ? ` · ${row.username}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-muted-foreground">
                Active accounts other than your own. Your own password changes from your account
                menu.
              </p>
            </div>
          )}

          {error ? (
            <p role="alert" className="text-body text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
              {pending ? "Making" : "Make link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShowLinkDialog({
  link,
  onClose,
}: {
  link: { url: string; expiresAt: string; kind: LinkKind } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select the link and copy it yourself.");
    }
  }

  return (
    <Dialog
      open={link !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {link?.kind === "reset" ? "Reset link made" : "Invite link made"}
          </DialogTitle>
          <DialogDescription>
            Copy it now. It cannot be shown again, and it stops working after one use or on{" "}
            {link ? formatAtVenue(link.expiresAt, { dateStyle: "medium", timeStyle: "short" }) : ""}
            .
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="made-link">The link</Label>
          <div className="flex gap-2">
            <Input
              id="made-link"
              readOnly
              value={link?.url ?? ""}
              onFocus={(event) => event.currentTarget.select()}
              className="text-caption font-mono"
            />
            <Button type="button" variant="outline" onClick={() => void copy()}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
