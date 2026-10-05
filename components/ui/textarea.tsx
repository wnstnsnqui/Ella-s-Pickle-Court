import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-border/30 placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:ring-foreground/10 aria-invalid:border-destructive aria-invalid:ring-destructive/20 flex field-sizing-content min-h-16 w-full resize-none rounded-xl border px-3 py-3 text-base transition-colors outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-[3px] md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
