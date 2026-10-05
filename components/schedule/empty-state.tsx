import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * Nothing to show, said properly. Spec 0003, AC-13.
 *
 * Two things reach this on the boards: a venue with no courts on it yet, and a
 * day the venue is simply closed. They are different sentences, so they are
 * different props rather than one shrug. It is the landing's closed panel, a
 * muted fill inside the board card (spec 0018, AC-5).
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: PhosphorIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Empty className="bg-muted rounded-2xl">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-card size-11 rounded-2xl">
          <Icon aria-hidden="true" weight="duotone" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
