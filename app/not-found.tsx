import { Compass } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * The route level not-found boundary, paired with `error.tsx`. Spec 0009, AC-6.
 *
 * A Server Component, unlike `error.tsx`: there is no error object or `reset`
 * handler here, just a path that matched no route.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <h1 className="sr-only">Court schedule</h1>
      <Empty className="border-border bg-card max-w-md rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Compass aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Page not found</EmptyTitle>
          <EmptyDescription className="flex flex-col items-center gap-3">
            <p>That page doesn&apos;t exist. Check the link, or head back to the board.</p>
            <Button asChild variant="outline">
              <Link href="/">Back to today</Link>
            </Button>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
