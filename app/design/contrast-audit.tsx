"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  contrastRatio,
  meets,
  resolveColor,
  type ContrastNeed,
  CONTRAST_MINIMUM,
} from "@/lib/design/contrast";

/**
 * Every pair AC-4 covers, measured in the browser in both themes.
 *
 * The list is the contract: body text at 4.5:1, and icons, large text, focus
 * rings and the boundaries of anything you can operate at 3:1. If a token is
 * nudged and a pair drops below its line, this table says so in red on the page
 * rather than waiting for somebody to squint at a screenshot.
 */
const PAIRS: Array<{ fg: string; bg: string; need: ContrastNeed; what: string }> = [
  { fg: "--foreground", bg: "--background", need: "body", what: "Body text on the page" },
  { fg: "--muted-foreground", bg: "--background", need: "body", what: "Quiet text on the page" },
  { fg: "--muted-foreground", bg: "--muted", need: "body", what: "Quiet text on a quiet fill" },
  { fg: "--card-foreground", bg: "--card", need: "body", what: "Text on a card" },
  { fg: "--popover-foreground", bg: "--popover", need: "body", what: "Text in a popover" },
  { fg: "--primary-foreground", bg: "--primary", need: "body", what: "Text on a primary button" },
  { fg: "--brand-foreground", bg: "--brand", need: "body", what: "Wordmark on the header band" },
  { fg: "--mark-foreground", bg: "--mark", need: "body", what: "Letter on the mark" },
  { fg: "--ring", bg: "--brand", need: "boundary", what: "Focus ring on the header band" },
  {
    fg: "--secondary-foreground",
    bg: "--secondary",
    need: "body",
    what: "Text on a secondary button",
  },
  { fg: "--accent-foreground", bg: "--accent", need: "body", what: "Text on a hovered row" },
  {
    fg: "--destructive-foreground",
    bg: "--destructive",
    need: "body",
    what: "Text on a destructive button",
  },
  {
    fg: "--state-available-fg",
    bg: "--state-available",
    need: "body",
    what: "Available cell, icon and label",
  },
  {
    fg: "--state-booked-fg",
    bg: "--state-booked",
    need: "body",
    what: "Booked cell, icon and label",
  },
  {
    fg: "--state-unavailable-fg",
    bg: "--state-unavailable",
    need: "body",
    what: "Unavailable cell, icon and label",
  },
  {
    fg: "--state-outofhours-fg",
    bg: "--state-outofhours",
    need: "body",
    what: "Out of hours cell, icon and label",
  },
  {
    fg: "--state-selected-fg",
    bg: "--state-selected",
    need: "body",
    what: "Selected cell, icon and label",
  },
  { fg: "--ring", bg: "--background", need: "boundary", what: "Focus ring on the page" },
  { fg: "--ring", bg: "--card", need: "boundary", what: "Focus ring on a card" },
  { fg: "--input", bg: "--background", need: "boundary", what: "Input and button boundary" },
  {
    fg: "--state-available-border",
    bg: "--background",
    need: "boundary",
    what: "Available cell boundary",
  },
  {
    fg: "--state-booked-border",
    bg: "--background",
    need: "boundary",
    what: "Booked cell boundary",
  },
  {
    fg: "--state-unavailable-border",
    bg: "--background",
    need: "boundary",
    what: "Unavailable cell boundary",
  },
  {
    fg: "--state-outofhours-border",
    bg: "--background",
    need: "boundary",
    what: "Out of hours cell boundary",
  },
  {
    fg: "--state-selected-border",
    bg: "--state-selected",
    need: "boundary",
    what: "Selected cell boundary",
  },
  { fg: "--destructive", bg: "--background", need: "boundary", what: "Error text and icon" },
  // The Clerk sign in card (spec 0004, AC-10) puts these on `--card`.
  { fg: "--muted-foreground", bg: "--card", need: "body", what: "Quiet text on a card" },
  { fg: "--primary", bg: "--card", need: "body", what: "Link on a card" },
  { fg: "--input", bg: "--card", need: "boundary", what: "Input boundary on a card" },
  { fg: "--destructive", bg: "--card", need: "boundary", what: "Error text and icon on a card" },
];

type Measured = { theme: "light" | "dark"; what: string; need: ContrastNeed; ratio: number };

/** Read what a token resolves to inside a subtree that is forced to one theme. */
function measure(theme: "light" | "dark"): Measured[] {
  const probe = document.createElement("div");
  probe.setAttribute("data-theme", theme);
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.append(probe);

  const style = getComputedStyle(probe);
  const out: Measured[] = [];
  for (const pair of PAIRS) {
    const fg = resolveColor(style.getPropertyValue(pair.fg).trim());
    const bg = resolveColor(style.getPropertyValue(pair.bg).trim());
    if (!fg || !bg) continue;
    out.push({ theme, what: pair.what, need: pair.need, ratio: contrastRatio(fg, bg) });
  }
  probe.remove();
  return out;
}

export function ContrastAudit() {
  const [rows, setRows] = useState<Measured[] | null>(null);

  useEffect(() => {
    // Measured after a paint, so the stylesheet is certainly in force by the time
    // the probe is asked what a token resolved to.
    const frame = requestAnimationFrame(() => setRows([...measure("light"), ...measure("dark")]));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!rows) {
    return (
      <p role="status" className="text-muted-foreground text-body">
        Measuring every pair in both themes…
      </p>
    );
  }

  const failing = rows.filter((row) => !meets(row.ratio, row.need));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body">
        {failing.length === 0 ? (
          <Badge className="bg-state-available text-state-available-fg border-state-available-border">
            All {rows.length} pairs meet WCAG AA in both themes
          </Badge>
        ) : (
          <Badge variant="destructive">
            {failing.length} of {rows.length} pairs are below AA
          </Badge>
        )}
      </p>

      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full text-left">
          <caption className="sr-only">
            Measured contrast ratio of every colour pair, in the light theme and the dark theme
          </caption>
          <thead className="bg-muted text-caption text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Pair
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Theme
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Needs
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Measured
              </th>
            </tr>
          </thead>
          <tbody className="text-label">
            {rows.map((row) => {
              const ok = meets(row.ratio, row.need);
              return (
                <tr key={`${row.theme}-${row.what}`} className="border-border border-t">
                  <th scope="row" className="px-3 py-1.5 font-normal">
                    {row.what}
                  </th>
                  <td className="text-muted-foreground px-3 py-1.5">{row.theme}</td>
                  <td className="text-muted-foreground px-3 py-1.5 tabular-nums">
                    {CONTRAST_MINIMUM[row.need].toFixed(1)}:1
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">
                    <span className={ok ? "text-state-available-fg" : "text-destructive"}>
                      {row.ratio.toFixed(2)}:1 {ok ? "pass" : "FAIL"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
