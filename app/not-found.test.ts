import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ currentSession: async () => null }));
vi.mock("@/components/staff-menu", () => ({ StaffMenu: () => null }));

const { default: NotFound } = await import("./not-found");

/**
 * The not found page: says so plainly, and leads back to the board at
 * `/schedule`, where it lives since spec 0013. It sits in the shell since spec
 * 0018, AC-13, so the shell's session read is stood in for.
 */
describe("NotFound", () => {
  it("says the page was not found and links back to today's board", async () => {
    // The page returns the shell, an async server component: render what it resolves to.
    const shell = NotFound() as React.ReactElement<{ children: React.ReactNode }>;
    const render = shell.type as (props: object) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(await render(shell.props));
    expect(html).toContain("Page not found");
    expect(html).toMatch(/<a[^>]*href="\/schedule"[^>]*>Back to today<\/a>/);
  });
});
