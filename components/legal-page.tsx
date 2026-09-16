import type { ReactNode } from "react";

/** Renders an ISO `PRIVACY_NOTICE_VERSION` date as the plain date it names. Spec 0010. */
export function formatNoticeVersion(version: string): string {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${version}T00:00:00Z`),
  );
}

/**
 * The shared shell for `/privacy` and `/terms`. Spec 0010, AC-14: one `h1`,
 * then one `h2` per section, so a screen reader can navigate the notice the
 * same way it would any other document.
 */
export function LegalPage({
  title,
  noticeVersion,
  children,
}: {
  title: string;
  noticeVersion: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-2xl space-y-8 pb-8">
      <header className="space-y-1">
        <h1 className="text-display">{title}</h1>
        <p className="text-caption text-muted-foreground">
          Last updated {formatNoticeVersion(noticeVersion)}
        </p>
      </header>
      <div className="space-y-6">{children}</div>
    </article>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-title">{heading}</h2>
      <div className="text-body space-y-2">{children}</div>
    </section>
  );
}
