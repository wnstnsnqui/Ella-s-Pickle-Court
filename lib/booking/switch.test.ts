import { afterEach, describe, expect, it, vi } from "vitest";

import { isPlaceholder, PAYMENT_ACCOUNT_NAME, PAYMENT_QR_SRC } from "@/lib/venue";

import { checkoutEnabled } from "./switch";

/**
 * Spec 0015, AC-26: checkout is on only when every checkout value is set and
 * neither payment fact is a placeholder.
 */

const ALL = {
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
  TURNSTILE_HOSTNAMES: "localhost,example.com",
  BOOKING_CLIENT_HASH_SECRET: "x".repeat(44),
};

const REAL = { accountName: "Ella's Pickle Court", qrSrc: "/payment-qr.png" };

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubAll() {
  for (const [name, value] of Object.entries(ALL)) vi.stubEnv(name, value);
}

describe("checkoutEnabled", () => {
  it("is on with every value set and real payment facts", () => {
    stubAll();
    expect(checkoutEnabled(REAL)).toBe(true);
  });

  it.each(Object.keys(ALL))("is off without %s", (missing) => {
    for (const [name, value] of Object.entries(ALL))
      vi.stubEnv(name, name === missing ? "" : value);
    expect(checkoutEnabled(REAL)).toBe(false);
  });

  it("is off while the account name is a placeholder", () => {
    stubAll();
    expect(checkoutEnabled({ ...REAL, accountName: "[QR account name]" })).toBe(false);
  });

  it("is off while the QR image is a placeholder", () => {
    stubAll();
    expect(checkoutEnabled({ ...REAL, qrSrc: "[/payment-qr.png]" })).toBe(false);
  });

  it("reads the venue's own facts by default, off while either is still a placeholder", () => {
    stubAll();
    const placeholder = isPlaceholder(PAYMENT_ACCOUNT_NAME) || isPlaceholder(PAYMENT_QR_SRC);
    expect(checkoutEnabled()).toBe(!placeholder);
  });
});
