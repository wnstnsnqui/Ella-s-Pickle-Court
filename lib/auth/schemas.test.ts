import { describe, expect, it } from "vitest";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "./constants";
import {
  changePasswordSchema,
  createAccountSchema,
  linkTokenSchema,
  redeemInviteSchema,
  resetPasswordFormSchema,
  safeRedirect,
  signInSchema,
} from "./schemas";

/**
 * Spec 0004 (revised), AC-4, AC-9 and AC-16: the four forms' boundaries, and
 * the one rule about where sign in may land.
 */

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE";

describe("usernames (AC-4)", () => {
  const username = (value: string) => signInSchema.safeParse({ username: value, password: "x" });

  it("lower cases and trims, so the claim and the bootstrap rule compare like for like", () => {
    const parsed = username("  Ella.P ");
    expect(parsed.success && parsed.data.username).toBe("ella.p");
  });

  it(`is ${USERNAME_MIN_LENGTH} to ${USERNAME_MAX_LENGTH} characters`, () => {
    expect(username("a".repeat(USERNAME_MIN_LENGTH - 1)).success).toBe(false);
    expect(username("a".repeat(USERNAME_MIN_LENGTH)).success).toBe(true);
    expect(username("a".repeat(USERNAME_MAX_LENGTH)).success).toBe(true);
    expect(username("a".repeat(USERNAME_MAX_LENGTH + 1)).success).toBe(false);
  });

  it("allows letters, digits, underscores and dots between them; nothing else", () => {
    expect(username("ella_p.2").success).toBe(true);
    expect(username("ella p").success).toBe(false);
    expect(username("ella@example.com").success).toBe(false);
    expect(username(".ella").success).toBe(false);
    expect(username("ella.").success).toBe(false);
    expect(username("ella..p").success).toBe(false);
  });
});

describe("passwords (AC-9)", () => {
  it(`are ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`, () => {
    const base = { name: "Ella", username: "ella" };
    expect(
      createAccountSchema.safeParse({ ...base, password: "a".repeat(PASSWORD_MIN_LENGTH - 1) })
        .success,
    ).toBe(false);
    expect(
      createAccountSchema.safeParse({ ...base, password: "a".repeat(PASSWORD_MIN_LENGTH) }).success,
    ).toBe(true);
    expect(
      createAccountSchema.safeParse({ ...base, password: "a".repeat(PASSWORD_MAX_LENGTH) }).success,
    ).toBe(true);
    expect(
      createAccountSchema.safeParse({ ...base, password: "a".repeat(PASSWORD_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
  });

  it("must be typed twice the same on the reset and change forms", () => {
    const reset = resetPasswordFormSchema.safeParse({ password: "a".repeat(10), confirm: "b" });
    expect(reset.success).toBe(false);
    expect(reset.success ? [] : reset.error.issues.map((i) => i.path.join("."))).toContain(
      "confirm",
    );
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "old",
        password: "a".repeat(10),
        confirm: "a".repeat(10),
      }).success,
    ).toBe(true);
  });
});

describe("names", () => {
  it("trim, must not be blank, and stop at 80", () => {
    const base = { username: "ella", password: "a".repeat(10) };
    const ok = createAccountSchema.safeParse({ ...base, name: "  Ella  " });
    expect(ok.success && ok.data.name).toBe("Ella");
    expect(createAccountSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
    expect(createAccountSchema.safeParse({ ...base, name: "x".repeat(81) }).success).toBe(false);
  });
});

describe("link tokens", () => {
  it("are 43 base64url characters, the shape createStaffInvite makes", () => {
    expect(linkTokenSchema.safeParse(TOKEN).success).toBe(true);
    expect(linkTokenSchema.safeParse(TOKEN.slice(1)).success).toBe(false);
    expect(linkTokenSchema.safeParse(`${TOKEN.slice(0, 42)}+`).success).toBe(false);
    expect(
      redeemInviteSchema.safeParse({
        token: "not-a-token",
        name: "E",
        username: "ella",
        password: "a".repeat(10),
      }).success,
    ).toBe(false);
  });
});

describe("safeRedirect (AC-4)", () => {
  it("honours a same origin path and nothing else", () => {
    expect(safeRedirect("/staff/reports?range=week", "/staff")).toBe("/staff/reports?range=week");
    expect(safeRedirect("https://evil.example/", "/staff")).toBe("/staff");
    expect(safeRedirect("//evil.example/", "/staff")).toBe("/staff");
    expect(safeRedirect("/\\evil.example", "/staff")).toBe("/staff");
    expect(safeRedirect("staff", "/staff")).toBe("/staff");
    expect(safeRedirect(null, "/staff")).toBe("/staff");
    expect(safeRedirect("", "/staff")).toBe("/staff");
  });
});
