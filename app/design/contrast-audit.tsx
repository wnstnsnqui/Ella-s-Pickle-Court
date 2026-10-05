"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  contrastRatio,
  meets,
  resolveColor,
  type ContrastNeed,
  type Rgb,
  CONTRAST_MINIMUM,
} from "@/lib/design/contrast";

/**
 * Every pair spec 0003 AC-4 covers, as spec 0018 AC-16 amends it, measured in
 * the browser.
 *
 * The list is the contract: body text at 4.5:1, and icons, large text, focus
 * rings and the boundaries of anything you can operate at 3:1. A grid tile's
 * edge is no longer held to 3:1 against the page: its icon and word carry the
 * state, so each view's text is measured on the tile's own fill instead. If a
 * token is nudged and a pair drops below its line, this table says so in red
 * on the page rather than waiting for somebody to squint at a screenshot.
 *
 * `glassOver` measures the header's glass at its worst: the background at 80
 * percent, composited over the darkest surface that can scroll under it.
 */
type Pair = { fg: string; bg: string; need: ContrastNeed; what: string; glassOver?: string };

const PAIRS: Pair[] = [
  { fg: "--foreground", bg: "--background", need: "body", what: "Body text on the page" },
  { fg: "--muted-foreground", bg: "--background", need: "body", what: "Quiet text on the page" },
  { fg: "--muted-foreground", bg: "--muted", need: "body", what: "Quiet text on a quiet fill" },
  { fg: "--foreground", bg: "--muted", need: "body", what: "Text on the muted page" },
  { fg: "--link", bg: "--muted", need: "body", what: "Eyebrow on the muted page" },
  { fg: "--card-foreground", bg: "--card", need: "body", what: "Text on a card" },
  { fg: "--popover-foreground", bg: "--popover", need: "body", what: "Text in a popover" },
  {
    fg: "--primary-foreground",
    bg: "--primary",
    need: "body",
    what: "Text on a yellow step button",
  },
  { fg: "--mark-foreground", bg: "--mark", need: "body", what: "The ink button, and the mark" },
  { fg: "--brand-foreground", bg: "--brand", need: "body", what: "Ink on the brand yellow" },
  { fg: "--ring", bg: "--brand", need: "boundary", what: "Focus ring on the brand yellow" },
  {
    fg: "--foreground",
    bg: "--background",
    glassOver: "--mark",
    need: "body",
    what: "Header links on the glass, over ink",
  },
  {
    fg: "--ring",
    bg: "--background",
    glassOver: "--mark",
    need: "boundary",
    what: "Focus ring on the glass, over ink",
  },
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
    what: "Available tile, icon and word",
  },
  {
    fg: "--state-booked-fg",
    bg: "--state-booked",
    need: "body",
    what: "Booked tile, icon and word",
  },
  {
    fg: "--state-unavailable-fg",
    bg: "--state-unavailable",
    need: "body",
    what: "Unavailable tile, icon and word",
  },
  {
    fg: "--state-outofhours-fg",
    bg: "--state-outofhours",
    need: "body",
    what: "Outside opening hours tile, icon and word",
  },
  {
    fg: "--state-selected-fg",
    bg: "--state-selected",
    need: "body",
    what: "Selected tile, icon and word",
  },
  { fg: "--muted-foreground", bg: "--muted", need: "body", what: "Saving tile, icon and word" },
  {
    fg: "--destructive-foreground",
    bg: "--destructive",
    need: "body",
    what: "Change refused tile, icon and word",
  },
  {
    fg: "--state-selected-border",
    bg: "--state-selected",
    need: "boundary",
    what: "Selected tile edge",
  },
  // Two focus looks (spec 0018, AC-1): amber on tiles, the day strip and links,
  // ink on fields, buttons, checkboxes, switches, badges and the calendar day.
  { fg: "--ring", bg: "--background", need: "boundary", what: "Amber focus on the page" },
  { fg: "--ring", bg: "--card", need: "boundary", what: "Amber focus on a card" },
  { fg: "--ring", bg: "--muted", need: "boundary", what: "Amber focus on the muted page" },
  {
    fg: "--foreground",
    bg: "--background",
    need: "boundary",
    what: "Ink focus on a control, on the page",
  },
  { fg: "--foreground", bg: "--card", need: "boundary", what: "Ink focus on a control, on a card" },
  {
    fg: "--foreground",
    bg: "--muted",
    need: "boundary",
    what: "Ink focus on a control, on the muted page",
  },
  { fg: "--input", bg: "--background", need: "boundary", what: "Input and button boundary" },
  { fg: "--destructive", bg: "--background", need: "boundary", what: "Error text and icon" },
  // The auth forms (spec 0004, AC-16) put these on `--card`.
  { fg: "--muted-foreground", bg: "--card", need: "body", what: "Quiet text on a card" },
  { fg: "--link", bg: "--card", need: "body", what: "Link on a card" },
  { fg: "--input", bg: "--card", need: "boundary", what: "Input boundary on a card" },
  { fg: "--destructive", bg: "--card", need: "boundary", what: "Error text and icon on a card" },
];

/** The glass's opacity over whatever scrolls under it (`surface-glass`). */
const GLASS_ALPHA = 0.8;

function composite(top: Rgb, under: Rgb, alpha: number): Rgb {
  return top.map((channel, i) => channel * alpha + under[i] * (1 - alpha)) as Rgb;
}

type Measured = { what: string; need: ContrastNeed; ratio: number };

/** Read what a token resolves to. */
function measure(): Measured[] {
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.append(probe);

  const style = getComputedStyle(probe);
  const out: Measured[] = [];
  for (const pair of PAIRS) {
    const fg = resolveColor(style.getPropertyValue(pair.fg).trim());
    const base = resolveColor(style.getPropertyValue(pair.bg).trim());
    const under = pair.glassOver
      ? resolveColor(style.getPropertyValue(pair.glassOver).trim())
      : null;
    if (!fg || !base || (pair.glassOver && !under)) continue;
    const bg = under ? composite(base, under, GLASS_ALPHA) : base;
    out.push({ what: pair.what, need: pair.need, ratio: contrastRatio(fg, bg) });
  }
  probe.remove();
  return out;
}

export function ContrastAudit() {
  const [rows, setRows] = useState<Measured[] | null>(null);

  useEffect(() => {
    // Measured after a paint, so the stylesheet is certainly in force by the time
    // the probe is asked what a token resolved to.
    const frame = requestAnimationFrame(() => setRows(measure()));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!rows) {
    return (
      <p role="status" className="text-muted-foreground text-body">
        Measuring every pair…
      </p>
    );
  }

  const failing = rows.filter((row) => !meets(row.ratio, row.need));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body">
        {failing.length === 0 ? (
          <Badge className="bg-state-available text-state-available-fg border-state-available-border">
            All {rows.length} pairs meet WCAG AA
          </Badge>
        ) : (
          <Badge variant="destructive">
            {failing.length} of {rows.length} pairs are below AA
          </Badge>
        )}
      </p>

      <div className="border-border overflow-x-auto rounded-2xl border">
        <table className="w-full text-left">
          <caption className="sr-only">Measured contrast ratio of every colour pair</caption>
          <thead className="bg-muted text-caption text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Pair
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
                <tr key={row.what} className="border-border border-t">
                  <th scope="row" className="px-3 py-1.5 font-normal">
                    {row.what}
                  </th>
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
