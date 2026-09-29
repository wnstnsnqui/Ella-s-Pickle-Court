import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Spec 0007, AC-2: a failed read shows an alert with the reason and a Try again that
 * asks the server for the page again. The refresh itself is a browser action.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const { SettingsError } = await import("./settings-error");

describe("SettingsError", () => {
  it("is an alert that names what did not load and why, with Try again", () => {
    const html = renderToStaticMarkup(
      createElement(SettingsError, { message: "The database timed out." }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("The settings did not load");
    expect(html).toContain("The database timed out.");
    expect(html).toMatch(/<button[^>]*>.*Try again<\/button>/);
  });
});
