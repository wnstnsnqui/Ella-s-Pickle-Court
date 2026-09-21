import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0004 (revised), AC-4 and AC-16: `/sign-in` sends a signed in visitor
 * to the board, honours only a same origin `redirect`, shows the reset
 * handover as a notice, and is kept out of search engines.
 */

const currentSession = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
);
vi.mock("@/lib/auth/session", () => ({ currentSession }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/auth-surface", () => ({
  AuthSurface: ({ children }: { children: ReactElement }) => children,
}));
vi.mock("@/components/auth/sign-in-form", () => ({ SignInForm: () => null }));

const { default: SignInPage, metadata } = await import("./page");

const props = (searchParams: Record<string, string> = {}) => ({
  params: Promise.resolve({}),
  searchParams: Promise.resolve(searchParams),
});

/** The props the page hands `SignInForm`. */
async function formProps(searchParams: Record<string, string> = {}) {
  const element = await SignInPage(props(searchParams) as never);
  if (!isValidElement(element)) throw new Error("expected an element");
  const form = (element.props as { children: unknown }).children;
  if (!isValidElement(form)) throw new Error("expected the form inside the surface");
  return form.props as { redirect: string; initialError: unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSession.mockResolvedValue(null);
});

describe("/sign-in", () => {
  it("sends a signed in visitor to /staff (AC-4)", async () => {
    currentSession.mockResolvedValue({ user: { id: "user_1" } });
    await expect(SignInPage(props() as never)).rejects.toThrow("NEXT_REDIRECT /staff");
  });

  it("lands on /staff by default and on a same origin redirect when given (AC-4)", async () => {
    expect((await formProps()).redirect).toBe("/staff");
    expect((await formProps({ redirect: "/staff/reports" })).redirect).toBe("/staff/reports");
    expect((await formProps({ redirect: "https://evil.example" })).redirect).toBe("/staff");
  });

  it("shows the reset handover as a notice, and ignores any other query", async () => {
    expect((await formProps({ reset: "1" })).initialError).toBe("reset");
    expect((await formProps({ error: "x" })).initialError).toBeNull();
    expect((await formProps()).initialError).toBeNull();
  });

  it("is noindex (AC-16)", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
