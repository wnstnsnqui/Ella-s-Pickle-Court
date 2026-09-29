import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Spec 0009, AC-6 and AC-7: a render failure shows a plain apology with Try
 * again and a way back to the board, and shows the digest as a reference
 * only when there is one. Reporting the error to PostHog runs in an effect,
 * which a server render does not run.
 */
vi.mock("posthog-js", () => ({ default: { captureException: vi.fn() } }));

const { default: ErrorPage } = await import("./error");

const render = (digest?: string) =>
  renderToStaticMarkup(
    createElement(ErrorPage, {
      error: Object.assign(new Error("boom"), digest ? { digest } : {}),
      reset: () => {},
    }),
  );

describe("ErrorPage", () => {
  it("apologises, offers Try again and links back to today's board", () => {
    const html = render();
    expect(html).toContain("Something went wrong on our side");
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
    expect(html).toMatch(/<a[^>]*href="\/schedule"[^>]*>Back to today<\/a>/);
  });

  it("shows the digest as a reference only when there is one", () => {
    expect(render("abc123")).toContain("Reference: abc123");
    expect(render()).not.toContain("Reference:");
  });

  it("never shows the raw error message to the reader", () => {
    expect(render()).not.toContain("boom");
  });
});
