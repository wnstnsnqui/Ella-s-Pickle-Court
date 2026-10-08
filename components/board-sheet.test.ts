// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement, createRef, Fragment } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarPlusIcon } from "@phosphor-icons/react";

import { CourtSheet } from "@/components/settings/court-sheet";
import { BookSheet } from "@/components/staff/book-sheet";
import { CloseSheet } from "@/components/staff/close-sheet";

import { BoardSheet } from "./board-sheet";

/**
 * A board sheet focuses its first field only once it has slid in.
 *
 * Focusing on the sheet's first frame, while it still sits below the screen,
 * made iOS raise the keyboard and scroll the page to reveal the field; the
 * sheet then landed with its top cut off. So the panel holds focus while the
 * sheet moves, and the first control takes it when the slide finishes.
 *
 * The slide is a CSS animation happy-dom never runs, so each test hands the
 * panel one stand in animation and finishes (or cancels) it by hand.
 */

type Slide = { finish: () => void; cancel: () => void };

let slide: Slide;
let original: typeof Element.prototype.getAnimations | undefined;

function stubSlide(animations: "one" | "none" = "one") {
  let finish!: () => void;
  let cancel!: () => void;
  const finished = new Promise<void>((resolve, reject) => {
    finish = resolve;
    cancel = () => reject(new DOMException("The animation was cancelled", "AbortError"));
  });
  slide = { finish: () => finish(), cancel: () => cancel() };
  Element.prototype.getAnimations = function () {
    return animations === "none" ? [] : [{ finished } as unknown as Animation];
  };
}

beforeEach(() => {
  original = Element.prototype.getAnimations;
  stubSlide();
});

afterEach(() => {
  cleanup();
  if (original) Element.prototype.getAnimations = original;
  else delete (Element.prototype as Partial<Element>).getAnimations;
});

const panel = () => screen.getByRole("dialog");

/** Let the slide end, and the focus hand off that waits on it run. */
async function land() {
  await act(async () => {
    slide.finish();
  });
}

type SheetProps = Parameters<typeof BoardSheet>[0];

function sheet(props: Partial<SheetProps> = {}, children?: React.ReactNode) {
  const all = {
    open: true,
    onOpenChange: () => {},
    icon: CalendarPlusIcon,
    title: "Book",
    description: "1 hour on 1 court.",
    ...props,
  } as SheetProps;
  return createElement(
    BoardSheet,
    all,
    children ??
      createElement(
        Fragment,
        null,
        createElement("label", { htmlFor: "name" }, "Customer name"),
        createElement("input", { id: "name" }),
        createElement("label", { htmlFor: "phone" }, "Phone"),
        createElement("input", { id: "phone" }),
      ),
  );
}

describe("while the sheet slides in", () => {
  it("keeps focus on the panel, not the first field", () => {
    render(sheet());

    expect(document.activeElement).toBe(panel());
    expect(document.activeElement).not.toBe(screen.getByLabelText("Customer name"));
  });
});

describe("once the sheet has landed", () => {
  it("moves focus to the first field", async () => {
    render(sheet());

    await land();

    expect(document.activeElement).toBe(screen.getByLabelText("Customer name"));
  });

  it("focuses the first field straight away when the sheet has no slide to wait for", async () => {
    stubSlide("none");

    await act(async () => {
      render(sheet());
    });

    expect(document.activeElement).toBe(screen.getByLabelText("Customer name"));
  });

  it("passes over a disabled button, a hidden input and anything out of the tab order", async () => {
    render(
      sheet(
        {},
        createElement(
          Fragment,
          null,
          createElement("input", { type: "hidden", name: "token" }),
          createElement("button", { type: "button", disabled: true }, "Saving"),
          createElement("button", { type: "button", tabIndex: -1 }, "Skipped"),
          createElement("select", { "aria-hidden": "true", tabIndex: -1 }),
          createElement("label", { htmlFor: "note" }, "Note"),
          createElement("textarea", { id: "note" }),
        ),
      ),
    );

    await land();

    expect(document.activeElement).toBe(screen.getByLabelText("Note"));
  });

  it("leaves the panel focused when focusOnOpen is false, for a sheet opened to read", async () => {
    render(sheet({ focusOnOpen: false }));

    await land();

    expect(document.activeElement).toBe(panel());
  });

  it("does not take focus back from a control the person moved to during the slide", async () => {
    render(sheet());
    const close = screen.getByRole("button", { name: "Close" });

    act(() => close.focus());
    await land();

    expect(document.activeElement).toBe(close);
  });
});

describe("a sheet closed before it lands", () => {
  it("swallows the cancelled slide and moves no focus", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    render(sheet());

    await act(async () => {
      slide.cancel();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off("unhandledRejection", unhandled);

    expect(unhandled).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(panel());
  });
});

describe("keyboard and focus return", () => {
  it("returns focus to the element that opened it when Escape closes it", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    const returnFocusTo = createRef<HTMLElement>() as React.RefObject<HTMLElement | null>;
    returnFocusTo.current = opener;
    const onOpenChange = vi.fn();
    const { rerender } = render(sheet({ onOpenChange, returnFocusTo }));
    await land();

    fireEvent.keyDown(document.activeElement ?? panel(), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await act(async () => {
      rerender(sheet({ open: false, onOpenChange, returnFocusTo }));
    });
    // Radix hands focus back a tick after the sheet unmounts.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe("the sheets that open on a form", () => {
  const forms = [
    {
      name: "Book",
      field: "Customer name",
      element: () =>
        createElement(BookSheet, {
          open: true,
          onOpenChange: () => {},
          runs: [],
          pending: false,
          onSubmit: async () => {},
        }),
    },
    {
      name: "Close hours",
      field: "Note",
      element: () =>
        createElement(CloseSheet, {
          open: true,
          onOpenChange: () => {},
          runs: [],
          pending: false,
          onSubmit: async () => {},
        }),
    },
    {
      name: "Add a court",
      field: "Name",
      element: () =>
        createElement(CourtSheet, {
          open: true,
          onOpenChange: () => {},
          court: null,
          stale: false,
          pending: false,
          onSubmit: async () => ({}),
        }),
    },
  ];

  it.each(forms)("$name leaves its first field alone until the sheet lands", async (form) => {
    render(form.element());

    expect(document.activeElement).toBe(panel());
    await land();

    expect(document.activeElement).toBe(screen.getByLabelText(form.field));
  });
});

/*
 * A field that claims focus itself (`autoFocus`) does it on the first frame and
 * goes around all of the above. So no file that renders a `BoardSheet`, or the
 * shared booking fields inside one, may use it.
 */

const root = join(__dirname, "..");

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return /\.tsx$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

const sheetFiles = [...sourcesUnder(join(root, "components")), ...sourcesUnder(join(root, "app"))]
  .filter((path) => {
    const source = readFileSync(path, "utf8");
    return source.includes("<BoardSheet") || path.endsWith("booking-fields.tsx");
  })
  .map((path) => relative(root, path));

describe("no sheet field claims focus on its own", () => {
  it("finds the sheets", () => {
    expect(sheetFiles).toContain("components/staff/book-sheet.tsx");
    expect(sheetFiles).toContain("components/staff/booking-fields.tsx");
  });

  it.each(sheetFiles)("%s uses no autoFocus", (path) => {
    expect(readFileSync(join(root, path), "utf8")).not.toMatch(/\bautoFocus\b/);
  });
});
