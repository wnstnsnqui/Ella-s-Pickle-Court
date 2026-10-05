import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { Select, SelectTrigger, SelectValue } from "./select";
import { Switch } from "./switch";
import { Textarea } from "./textarea";

/**
 * Spec 0018, AC-1 as amended: the focus look on the shared controls, which
 * changes everywhere, the landing included. A field shows focus as an ink edge
 * with a 3px halo of ink at 10 percent. A button, checkbox, switch, badge and
 * the calendar's focused day show a crisp 2px ink outline with a see through
 * 2px offset (`outline-offset`, never a painted `ring-offset`), a destructive
 * button the same in red. No amber halo (`ring-ring/50`) remains on a control.
 *
 * And AC-2: `Button` gains the `ink` variant, and only that.
 */

const classOf = (html: string) => /class="([^"]*)"/.exec(html)?.[1].split(" ") ?? [];
const html = (type: Parameters<typeof createElement>[0], props: object = {}) =>
  renderToStaticMarkup(createElement(type, props));

/** The outline recipe: solid is spelled out because `outline-none` blanks the style. */
const OUTLINE = [
  "focus-visible:outline-2",
  "focus-visible:outline-solid",
  "focus-visible:outline-offset-2",
];

describe("fields: an ink edge with a faint ink halo", () => {
  const fields = {
    Input: html(Input),
    Textarea: html(Textarea),
    "Select trigger": html(Select, {
      children: createElement(SelectTrigger, null, createElement(SelectValue)),
    }),
  };

  it.each(Object.entries(fields))("%s focuses in ink, not amber (AC-1)", (_, markup) => {
    const classes = classOf(markup);
    expect(classes).toEqual(
      expect.arrayContaining([
        "focus-visible:border-foreground",
        "focus-visible:ring-foreground/10",
        "focus-visible:ring-[3px]",
      ]),
    );
    expect(markup).not.toContain("ring-ring");
    expect(markup).not.toContain("border-ring");
  });
});

describe("controls: a crisp ink outline with a see through gap", () => {
  const controls = {
    Button: html(Button, { children: "Save" }),
    Checkbox: html(Checkbox),
    Switch: html(Switch),
    Badge: html(Badge, { children: "New" }),
  };

  it.each(Object.entries(controls))(
    "%s draws a 2px ink outline, offset 2px (AC-1)",
    (_, markup) => {
      expect(classOf(markup)).toEqual(
        expect.arrayContaining([...OUTLINE, "focus-visible:outline-foreground"]),
      );
    },
  );

  it.each(Object.entries(controls))(
    "%s never paints a ring offset or an amber halo",
    (_, markup) => {
      expect(markup).not.toContain("ring-offset");
      expect(markup).not.toContain("ring-ring");
    },
  );

  it("gives a destructive button the same outline in red", () => {
    const classes = classOf(html(Button, { variant: "destructive", children: "Retire" }));
    expect(classes).toContain("focus-visible:outline-destructive");
    expect(classes).toContain("focus-visible:outline-solid");
  });
});

describe("the ink button (AC-2)", () => {
  it("fills with the mark and writes in the mark's foreground", () => {
    const markup = html(Button, { variant: "ink", children: "Book" });
    expect(markup).toContain('data-variant="ink"');
    expect(classOf(markup)).toEqual(
      expect.arrayContaining(["bg-mark", "text-mark-foreground", "hover:bg-mark/90"]),
    );
  });

  it("leaves the default button yellow", () => {
    expect(classOf(html(Button, { children: "Save" }))).toContain("bg-primary");
  });
});

describe("no shared control keeps the amber halo (AC-1)", () => {
  const files = [
    "input",
    "textarea",
    "select",
    "checkbox",
    "switch",
    "badge",
    "calendar",
    "button",
  ].map((name) => [name, readFileSync(new URL(`./${name}.tsx`, import.meta.url), "utf8")]);

  it.each(files)("%s has no ring-ring/50 and no ring offset", (_, source) => {
    expect(source).not.toContain("ring-ring/50");
    expect(source).not.toMatch(/focus-visible:ring-offset/);
  });

  it("draws the calendar's focused day with the ink outline", () => {
    const source = files.find(([name]) => name === "calendar")?.[1] ?? "";
    expect(source).toContain("group-data-[focused=true]/day:outline-foreground");
    expect(source).toContain("group-data-[focused=true]/day:outline-offset-2");
  });
});
