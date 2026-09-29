import { describe, expect, it } from "vitest";

import { staffTransportThrew, toStaffTransportResult } from "./staff-transport";

/**
 * Spec 0014, AC-5 and AC-6: on the staff board only a thrown call and the
 * `failed` kind are retried; every other refusal comes back at once.
 */

const refused = (kind: string, reason?: string) =>
  toStaffTransportResult({ ok: false, error: { kind, message: `${kind}.`, reason } });

describe("toStaffTransportResult", () => {
  it("passes a landed day through", () => {
    expect(toStaffTransportResult({ ok: true, data: 1 })).toEqual({ ok: true, data: 1 });
  });

  it("retries `failed` and a thrown call", () => {
    expect(refused("failed")).toEqual({ ok: false, message: "failed.", retry: true });
    expect(staffTransportThrew(new Error("offline"))).toEqual({
      ok: false,
      message: "offline",
      retry: true,
    });
  });

  it("never retries a refusal", () => {
    for (const kind of ["unauthenticated", "forbidden", "not_found", "invalid", "conflict"]) {
      expect(refused(kind)).toMatchObject({ ok: false, retry: false });
    }
  });

  it("hands on an out of range day, not retried", () => {
    expect(refused("invalid", "out_of_range")).toEqual({
      ok: false,
      message: "invalid.",
      retry: false,
      reason: "out_of_range",
    });
  });
});
