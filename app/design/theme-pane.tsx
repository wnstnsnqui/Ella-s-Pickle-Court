import { cn } from "@/lib/utils";

/**
 * Shows the same thing twice, once in each theme.
 *
 * `data-theme` is the one hook the token layer exposes for exactly this, and this
 * folder is the only place allowed to use it. Everywhere else, a component names
 * a token and the device decides.
 */
export function ThemePair({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <ThemePane theme="light">{children}</ThemePane>
      <ThemePane theme="dark">{children}</ThemePane>
    </div>
  );
}

export function ThemePane({
  theme,
  children,
  className,
}: {
  theme: "light" | "dark";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      data-theme={theme}
      aria-label={`${theme} theme`}
      className={cn(
        "bg-background text-foreground border-border flex flex-col gap-3 rounded-lg border p-4",
        className,
      )}
    >
      <h3 className="text-caption text-muted-foreground uppercase">{theme}</h3>
      {children}
    </section>
  );
}
