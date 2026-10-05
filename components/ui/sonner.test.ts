import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Toaster } from "./sonner";

/**
 * Spec 0003, AC-1 and AC-14: the toast reads our tokens and stays light
 * whatever the device's theme.
 *
 * Sonner itself is a boundary, so it is replaced with a spy that records what the
 * wrapper hands it. `vi.mock` is hoisted above the import, so the wrapper gets the spy.
 * The import sits at the top, not inside a test: the wrapper pulls in the whole
 * Phosphor main entry, which takes seconds to load and would eat the first test's
 * five second limit.
 */

const received = vi.fn();
vi.mock("sonner", () => ({
  Toaster: (props: Record<string, unknown>) => {
    received(props);
    return createElement("section", { "aria-label": "Notifications" });
  },
}));

function render(extra: Record<string, unknown> = {}) {
  received.mockClear();
  renderToStaticMarkup(createElement(Toaster, extra));
  return received.mock.calls[0][0] as Record<string, unknown>;
}

describe("Toaster", () => {
  it("pins sonner to light, so a device in dark mode cannot repaint the toast (AC-1)", () => {
    const props = render();
    expect(props.theme).toBe("light");
  });

  it("colours the description from the token layer, not sonner's own grey (AC-1)", () => {
    const props = render();
    const options = props.toastOptions as { classNames: Record<string, string> };
    expect(options.classNames.description).toBe("text-muted-foreground!");
  });

  it("paints from the popover, border and radius tokens rather than fixed colours (AC-1)", () => {
    const props = render();
    expect(props.style).toEqual({
      "--normal-bg": "var(--popover)",
      "--normal-text": "var(--popover-foreground)",
      "--normal-border": "var(--border)",
      "--border-radius": "var(--radius)",
    });
  });

  it("supplies an icon for every toast kind (AC-14)", () => {
    const props = render();
    const icons = props.icons as Record<string, unknown>;
    expect(Object.keys(icons).sort()).toEqual(["error", "info", "loading", "success", "warning"]);
    for (const icon of Object.values(icons)) expect(isValidElement(icon)).toBe(true);
  });

  it("lets a caller override defaults, so a page can place it where it needs", () => {
    const props = render({ position: "top-center", theme: "dark" });
    expect(props.position).toBe("top-center");
    expect(props.theme).toBe("dark");
  });
});
