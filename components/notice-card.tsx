import type { IconWeight } from "@phosphor-icons/react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * One message on a page of its own: a white card on the muted page (spec
 * 0018, AC-13), the icon in the landing's icon chip. `BoardNotice`, the not
 * found page and the error page all show theirs in it. No hooks and no server
 * only import, so the error page, a client component, can use it too.
 */
export function NoticeCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    // `rounded-3xl` and `border-0` spelled out, so `cn` drops the primitive's
    // own radius and edge rather than leaving them to fight `surface-card`.
    <Empty className="surface-card mx-auto my-6 max-w-lg rounded-3xl border-0 sm:my-10">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-11 rounded-2xl">
          <Icon aria-hidden="true" weight="duotone" className="size-6" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription className="flex flex-col items-center gap-3 [&>a]:no-underline">
          {children}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
