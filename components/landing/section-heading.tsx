import { cn } from "@/lib/utils";

/** The eyebrow, headline and lede every landing section opens with. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  children,
  className,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-reveal className={cn("flex max-w-2xl flex-col gap-3", className)}>
      <p className="text-label text-link tracking-wide uppercase">{eyebrow}</p>
      <h2 id={id} className="text-headline text-balance">
        {title}
      </h2>
      {children ? (
        <p className="text-body text-muted-foreground max-w-[56ch] text-pretty">{children}</p>
      ) : null}
    </div>
  );
}
