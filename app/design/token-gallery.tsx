import { cn } from "@/lib/utils";

/**
 * Every token, shown as the thing it actually is. Spec 0003, AC-3.
 *
 * These blocks are deliberately dumb: they name a token and paint with it, so
 * what you see is what the token layer resolves to and not a description of it.
 */
const SURFACE = [
  ["--background", "bg-background"],
  ["--foreground", "bg-foreground"],
  ["--card", "bg-card"],
  ["--muted", "bg-muted"],
  ["--muted-foreground", "bg-muted-foreground"],
  ["--accent", "bg-accent"],
  ["--secondary", "bg-secondary"],
  ["--border", "bg-border"],
  ["--input", "bg-input"],
  ["--ring", "bg-ring"],
] as const;

const ACCENT = [
  ["--primary", "bg-primary"],
  ["--primary-foreground", "bg-primary-foreground"],
  ["--destructive", "bg-destructive"],
  ["--destructive-foreground", "bg-destructive-foreground"],
] as const;

const STATE = [
  ["available", "bg-state-available", "text-state-available-fg", "border-state-available-border"],
  ["booked", "bg-state-booked", "text-state-booked-fg", "border-state-booked-border"],
  [
    "unavailable",
    "bg-state-unavailable",
    "text-state-unavailable-fg",
    "border-state-unavailable-border",
  ],
  [
    "outofhours",
    "bg-state-outofhours",
    "text-state-outofhours-fg",
    "border-state-outofhours-border",
  ],
  ["selected", "bg-state-selected", "text-state-selected-fg", "border-state-selected-border"],
] as const;

function Swatch({ name, fill }: { name: string; fill: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn("border-border size-8 shrink-0 rounded-md border", fill)} />
      <code className="text-caption text-muted-foreground">{name}</code>
    </li>
  );
}

export function ColorTokens() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h4 className="text-label mb-2">Surface</h4>
        <ul className="grid grid-cols-2 gap-2">
          {SURFACE.map(([name, fill]) => (
            <Swatch key={name} name={name} fill={fill} />
          ))}
        </ul>
      </div>
      <div>
        <h4 className="text-label mb-2">Accent</h4>
        <ul className="grid grid-cols-2 gap-2">
          {ACCENT.map(([name, fill]) => (
            <Swatch key={name} name={name} fill={fill} />
          ))}
        </ul>
      </div>
      <div>
        <h4 className="text-label mb-2">State</h4>
        <ul className="flex flex-col gap-2">
          {STATE.map(([name, bg, fg, border]) => (
            <li key={name}>
              <span
                className={cn(
                  "text-label flex items-center justify-between rounded-md border px-3 py-2",
                  bg,
                  fg,
                  border,
                )}
              >
                <code>--state-{name}</code>
                <span>fill · text · boundary</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const TYPE = [
  ["display", "text-display", "1.75rem / 2rem / 600"],
  ["title", "text-title", "1.25rem / 1.75rem / 600"],
  ["body", "text-body", "0.9375rem / 1.375rem / 400"],
  ["label", "text-label", "0.8125rem / 1.125rem / 500"],
  ["cell", "text-cell", "0.8125rem / 1 / 600, tabular"],
  ["caption", "text-caption", "0.75rem / 1rem / 400"],
] as const;

export function TypeScale() {
  return (
    <ul className="flex flex-col gap-3">
      {TYPE.map(([name, utility, spec]) => (
        <li key={name} className="flex flex-wrap items-baseline justify-between gap-2">
          <span className={cn(utility, name === "cell" && "tabular-nums")}>
            {name} · 9am 12nn 4:30pm
          </span>
          <code className="text-caption text-muted-foreground">
            {utility} · {spec}
          </code>
        </li>
      ))}
    </ul>
  );
}

const SPACE = [1, 2, 3, 4, 6, 8, 12] as const;
const RADIUS = [
  ["rounded-cell", "--radius-cell", "rounded-cell"],
  ["rounded-md", "--radius - 2px", "rounded-md"],
  ["rounded-lg", "--radius", "rounded-lg"],
  ["rounded-xl", "--radius + 4px", "rounded-xl"],
] as const;

export function SpaceAndRadius() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h4 className="text-label mb-2">Spacing, the only steps this project uses</h4>
        <ul className="flex flex-wrap items-end gap-3">
          {SPACE.map((step) => (
            <li key={step} className="flex flex-col items-center gap-1">
              <span
                className="bg-primary block w-2 rounded-sm"
                style={{ height: `calc(var(--spacing) * ${step})` }}
              />
              <code className="text-caption text-muted-foreground">{step}</code>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="text-label mb-2">Radii</h4>
        <ul className="flex flex-wrap gap-3">
          {RADIUS.map(([name, value, utility]) => (
            <li key={name} className="flex flex-col items-center gap-1">
              <span className={cn("bg-muted border-border size-12 border", utility)} />
              <code className="text-caption text-muted-foreground">{value}</code>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="text-label mb-2">Grid geometry</h4>
        <ul className="text-caption text-muted-foreground flex flex-col gap-1">
          <li>
            <code>--row-h</code> 2.75rem, the 44px minimum touch target a slot row has to clear
          </li>
          <li>
            <code>--col-time</code> 3.5rem, the pinned time column
          </li>
          <li>
            <code>--col-court-min</code> 5.5rem, the narrowest a court column ever gets
          </li>
          <li>
            <code>--dur-fast</code> 120ms · <code>--dur-slow</code> 1.2s, the changed cell highlight
          </li>
        </ul>
      </div>
    </div>
  );
}
