import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Spec 0003, AC-1 and AC-14: the toast reads our tokens and never carries a
 * theme of its own.
 *
 * Sonner itself is a boundary, so it is replaced with a spy that records what the
 * wrapper hands it.
 */

const received = vi.fn();
vi.mock("sonner", () => ({
  Toaster: (props: Record<string, unknown>) => {
    received(props);
    return createElement("section", { "aria-label": "Notifications" });
  },
}));

async function render(extra: Record<string, unknown> = {}) {
  received.mockClear();
  const { Toaster } = await import("./sonner");
  renderToStaticMarkup(createElement(Toaster, extra));
  return received.mock.calls[0][0] as Record<string, unknown>;
}

describe("Toaster", () => {
  it("tells sonner not to add a theme class of its own (AC-1)", async () => {
    const props = await render();
    expect(props.theme).toBe("system");
  });

  it("paints from the popover, border and radius tokens rather than fixed colours (AC-1)", async () => {
    const props = await render();
    expect(props.style).toEqual({
      "--normal-bg": "var(--popover)",
      "--normal-text": "var(--popover-foreground)",
      "--normal-border": "var(--border)",
      "--border-radius": "var(--radius)",
    });
  });

  it("supplies an icon for every toast kind (AC-14)", async () => {
    const props = await render();
    const icons = props.icons as Record<string, unknown>;
    expect(Object.keys(icons).sort()).toEqual(["error", "info", "loading", "success", "warning"]);
    for (const icon of Object.values(icons)) expect(isValidElement(icon)).toBe(true);
  });

  it("lets a caller override defaults, so a page can place it where it needs", async () => {
    const props = await render({ position: "top-center", theme: "dark" });
    expect(props.position).toBe("top-center");
    expect(props.theme).toBe("dark");
  });
});
