import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0004 (revised), AC-1, AC-2 and AC-16: `/sign-up` is the bootstrap
 * door while no user exists and only the staff only line afterwards;
 * `/sign-up/[token]` renders the form only for a pending invite. Both send a
 * signed in visitor to the board and are kept out of search engines.
 */

const currentSession = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
);
const countAuthUsers = vi.hoisted(() => vi.fn());
const peekStaffInvite = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ currentSession }));
vi.mock("@/lib/auth/pool", () => ({ countAuthUsers, peekStaffInvite }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/auth-surface", () => ({
  AuthSurface: ({ children }: { children: ReactElement }) => children,
}));
const CreateAccountForm = () => null;
const LinkNotPending = () => null;
vi.mock("@/components/auth/create-account-form", () => ({ CreateAccountForm }));
vi.mock("@/components/auth/link-not-pending", () => ({ LinkNotPending }));
vi.mock("@/lib/env", () => ({ authConfigured: true }));

const { default: SignUpPage, metadata } = await import("./page");
const { default: RedeemPage, metadata: redeemMetadata } = await import("./[token]/page");
const { hashLinkToken } = await import("@/lib/auth/invite-cookie");

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE";

const page = (params: Record<string, string> = {}, searchParams: Record<string, string> = {}) =>
  ({ params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) }) as never;

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
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("/sign-up (AC-2)", () => {
  it("sends a signed in visitor to /staff", async () => {
    currentSession.mockResolvedValue({ user: { id: "user_1" } });
    await expect(SignUpPage()).rejects.toThrow("NEXT_REDIRECT /staff");
  });

  it("shows the bootstrap form only while no user exists", async () => {
    countAuthUsers.mockResolvedValue(0);
    const open = await rendered(await SignUpPage());
    expect(open.type).toBe(CreateAccountForm);
    expect(open.props.mode).toEqual({ kind: "bootstrap" });

    countAuthUsers.mockResolvedValue(1);
    const closed = await rendered(await SignUpPage());
    expect(closed.type).toBe(LinkNotPending);
  });

  it("stays closed when the count cannot be read", async () => {
    countAuthUsers.mockRejectedValue(new Error("pool down"));
    const closed = await rendered(await SignUpPage());
    expect(closed.type).toBe(LinkNotPending);
  });

  it("is noindex (AC-16)", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(redeemMetadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("/sign-up/[token] (AC-1)", () => {
  it("sends a signed in visitor to /staff", async () => {
    currentSession.mockResolvedValue({ user: { id: "user_1" } });
    await expect(RedeemPage(page({ token: TOKEN }))).rejects.toThrow("NEXT_REDIRECT /staff");
  });

  it("peeks the hashed token and renders the form for a pending invite", async () => {
    peekStaffInvite.mockResolvedValue({ kind: "invite" });
    const element = await rendered(await RedeemPage(page({ token: TOKEN })));
    expect(peekStaffInvite).toHaveBeenCalledWith(hashLinkToken(TOKEN));
    expect(element.type).toBe(CreateAccountForm);
    expect(element.props).toEqual({ mode: { kind: "invite", token: TOKEN } });
  });

  it("shows the plain message for a link that is not pending, a reset link, or not a token at all", async () => {
    peekStaffInvite.mockResolvedValue(null);
    expect((await rendered(await RedeemPage(page({ token: TOKEN })))).type).toBe(LinkNotPending);
    peekStaffInvite.mockResolvedValue({ kind: "reset", targetUsername: "x" });
    expect((await rendered(await RedeemPage(page({ token: TOKEN })))).type).toBe(LinkNotPending);
    peekStaffInvite.mockClear();
    expect((await rendered(await RedeemPage(page({ token: "nope" })))).type).toBe(LinkNotPending);
    expect(peekStaffInvite).not.toHaveBeenCalled();
  });
});
