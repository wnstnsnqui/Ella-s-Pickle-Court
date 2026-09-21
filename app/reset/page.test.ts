import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0004 (revised), AC-7 and AC-16: `/reset/[token]` shows the form, with
 * the account's username, only for a pending reset link; anything else gets the
 * plain message. Signed in visitors go to the board; the page is noindex.
 */

const currentSession = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
);
const peekStaffInvite = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ currentSession }));
vi.mock("@/lib/auth/pool", () => ({ peekStaffInvite }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/auth-surface", () => ({
  AuthSurface: ({ children }: { children: ReactElement }) => children,
}));
const ResetPasswordForm = () => null;
const LinkNotPending = () => null;
vi.mock("@/components/auth/reset-password-form", () => ({ ResetPasswordForm }));
vi.mock("@/components/auth/link-not-pending", () => ({ LinkNotPending }));
vi.mock("@/lib/env", () => ({ authConfigured: true }));

const { default: ResetPage, metadata } = await import("./[token]/page");

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE";
const page = (token: string) =>
  ({ params: Promise.resolve({ token }), searchParams: Promise.resolve({}) }) as never;

/** The element inside the surface: the form, or the not pending message. */
async function rendered(element: unknown) {
  if (!isValidElement(element)) throw new Error("expected an element");
  const inner = (element.props as { children: unknown }).children;
  if (!isValidElement(inner)) throw new Error("expected an element inside the surface");
  return inner as ReactElement<Record<string, unknown>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSession.mockResolvedValue(null);
});

describe("/reset/[token] (AC-7)", () => {
  it("sends a signed in visitor to /staff", async () => {
    currentSession.mockResolvedValue({ user: { id: "user_1" } });
    await expect(ResetPage(page(TOKEN))).rejects.toThrow("NEXT_REDIRECT /staff");
  });

  it("renders the form with the target's username for a pending reset", async () => {
    peekStaffInvite.mockResolvedValue({ kind: "reset", targetUsername: "ella" });
    const element = await rendered(await ResetPage(page(TOKEN)));
    expect(element.type).toBe(ResetPasswordForm);
    expect(element.props).toEqual({ token: TOKEN, username: "ella" });
  });

  it("shows the plain message for a used link or an invite link", async () => {
    peekStaffInvite.mockResolvedValue(null);
    expect((await rendered(await ResetPage(page(TOKEN)))).type).toBe(LinkNotPending);
    peekStaffInvite.mockResolvedValue({ kind: "invite" });
    expect((await rendered(await ResetPage(page(TOKEN)))).type).toBe(LinkNotPending);
  });

  it("is noindex (AC-16)", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
