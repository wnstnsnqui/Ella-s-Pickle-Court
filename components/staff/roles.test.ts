import { describe, expect, it } from "vitest";

import { superadminOptionDisabled } from "./roles";

/**
 * Spec 0012, AC-3: the pure logic behind editing a row, shared by
 * `UsersPanel` and `UserSheet`.
 */

describe("superadminOptionDisabled", () => {
  it("stays enabled under the cap of two", () => {
    expect(superadminOptionDisabled("staff", 1)).toBe(false);
  });

  it("disables the option once two rows already hold superadmin", () => {
    expect(superadminOptionDisabled("staff", 2)).toBe(true);
  });

  it("never disables it for a row that is already superadmin, so its own value stays selectable", () => {
    expect(superadminOptionDisabled("superadmin", 2)).toBe(false);
  });
});
