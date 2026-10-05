import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CreateAccountForm } from "./create-account-form";
import { ResetPasswordForm } from "./reset-password-form";
import { SignInForm } from "./sign-in-form";

/**
 * Spec 0018, AC-13 and AC-4: the sign in, sign up and reset forms take the
 * landing's 44px fields (`h-11`) and an ink submit. The shared `Input` keeps
 * its own height for the landing (AC-1), so each form sizes its fields where
 * it uses them; this pins that every visible field in all three does.
 *
 * The router, the auth client and the server actions are boundaries: nothing
 * here submits, it only renders.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({ authClient: {} }));
vi.mock("@/lib/auth/actions", () => ({ redeemInvite: vi.fn(), resetPassword: vi.fn() }));

const FORMS = {
  "sign in": () => createElement(SignInForm, { redirect: "/staff", initialError: null }),
  "sign up from an invite": () =>
    createElement(CreateAccountForm, { mode: { kind: "invite", token: "token" } }),
  "the bootstrap sign up": () => createElement(CreateAccountForm, { mode: { kind: "bootstrap" } }),
  reset: () => createElement(ResetPasswordForm, { token: "token", username: "lea" }),
};

/** Every input a person sees: not hidden, not a checkbox or radio. */
const fields = (html: string) =>
  [...html.matchAll(/<input[^>]*>/g)]
    .map((m) => m[0])
    .filter((input) => !/type="(hidden|checkbox|radio)"/.test(input));

describe("the auth forms", () => {
  it.each(Object.entries(FORMS))("%s has fields to fill", (_, form) => {
    expect(fields(renderToStaticMarkup(form())).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(FORMS))("%s sizes every field at 44px, h-11 (AC-13)", (_, form) => {
    for (const field of fields(renderToStaticMarkup(form()))) {
      expect(field).toMatch(/class="[^"]*\bh-11\b/);
      expect(field).not.toMatch(/class="[^"]*\bh-9\b/);
    }
  });

  it.each(Object.entries(FORMS))("%s submits with the ink button (AC-4, AC-13)", (_, form) => {
    const submit = /<button[^>]*type="submit"[^>]*>|<button(?=[^>]*type="submit")[^>]*>/.exec(
      renderToStaticMarkup(form()),
    )?.[0];
    expect(submit).toContain('data-variant="ink"');
  });
});
