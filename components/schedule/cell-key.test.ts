import { describe, expect, it } from "vitest";

import { cellKey, parseCellKey } from "./cell-key";

/** A key names a cell by court and row start; parsing it back must be exact. */
describe("cellKey and parseCellKey", () => {
  it("round trips a court id and an ISO instant", () => {
    const key = cellKey(12, "2026-09-15T08:00:00.000Z");
    expect(key).toBe("12@2026-09-15T08:00:00.000Z");
    expect(parseCellKey(key)).toEqual({ courtId: 12, rowStartsAt: "2026-09-15T08:00:00.000Z" });
  });
});
