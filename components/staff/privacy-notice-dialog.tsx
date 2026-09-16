"use client";

import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { acknowledgePrivacyNotice } from "@/lib/legal/actions";

/**
 * The one time (and once per version) staff acknowledgement. Spec 0010,
 * AC-10, AC-11, AC-12.
 *
 * `open` is a prop, not local state: `app/staff/layout.tsx` (a Server
 * Component) decides whether this shows on every render, from the staff row
 * it just read, so a `router.refresh()` after acknowledging closes the
 * dialog by re-rendering the layout with a fresh answer. This component
 * never imports `lib/legal/constants.ts`; it sends back exactly the version
 * it was told to show, and the server checks that version still matches its
 * own constant.
 *
 * Dismissal is blocked on every route out except the one button: no close
 * button, Escape does nothing, and a click outside does nothing.
 */
export function PrivacyNoticeDialog({
  open,
  noticeVersion,
}: {
  open: boolean;
  noticeVersion: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAcknowledge() {
    setPending(true);
    setError(null);
    const result = await acknowledgePrivacyNotice({ version: noticeVersion });
    setPending(false);
    if (result.ok) {
      router.refresh();
      return;
    }
    setError(result.error.message);
  }

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Before you get started</DialogTitle>
          <DialogDescription>
            A quick note on what this tool records, once per notice update.
          </DialogDescription>
        </DialogHeader>
        <ul className="text-body list-disc space-y-2 pl-5">
          <li>Your name and email are held by Clerk, our sign in provider.</li>
          <li>Signing in sets a cookie on this device, on staff pages only.</li>
          <li>
            Your Clerk id, name and role are sent to PostHog, our analytics tool, and kept in this
            browser&apos;s local storage while you use staff pages.
          </li>
          <li>
            A customer&apos;s name, phone number and note are never sent to PostHog and never shown
            on the public board.
          </li>
          <li>
            A customer&apos;s phone number is cleared automatically after it is no longer needed.
          </li>
        </ul>
        <p className="text-caption">
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground rounded-sm underline-offset-4 hover:underline"
          >
            Read the full privacy notice
          </a>{" "}
          (opens in a new tab).
        </p>
        {error ? (
          <p role="alert" className="text-label text-destructive flex items-start gap-2">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" disabled={pending} onClick={handleAcknowledge}>
            Acknowledge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
