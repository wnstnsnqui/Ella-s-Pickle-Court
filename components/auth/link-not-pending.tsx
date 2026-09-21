import { LinkIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { STAFF_ONLY_LINE } from "@/lib/auth/constants";

/**
 * What a link page shows when its link cannot be used: already used,
 * revoked, expired, or never a link at all. Spec 0004 (revised), AC-1, AC-7.
 * A plain message, the staff only line, and the way to sign in for someone
 * who already has an account.
 */
export function LinkNotPending({
  title,
  body = "It may have been used already, revoked, or more than seven days old. Ask Ella for a new one.",
}: {
  title: string;
  body?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="bg-secondary text-secondary-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-md">
          <LinkIcon aria-hidden="true" className="size-4" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-title">{title}</p>
          <p className="text-body text-muted-foreground">{body}</p>
        </div>
      </div>
      <p className="text-body">{STAFF_ONLY_LINE}</p>
      <Button asChild variant="outline" className="w-full">
        <Link href="/sign-in">I already have an account</Link>
      </Button>
    </div>
  );
}
