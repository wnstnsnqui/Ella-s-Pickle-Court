import { cn } from "@/lib/utils";

export function ThemePane({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-background text-foreground border-border flex flex-col gap-3 rounded-lg border p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
