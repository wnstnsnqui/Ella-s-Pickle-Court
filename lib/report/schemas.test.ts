import { describe, expect, it } from "vitest";

import { DEFAULT_REPORT_RANGE } from "./range";
import { reportQuerySchema } from "./schemas";

/**
 * Spec 0008, AC-2: a bad or stale query value behaves exactly like an absent
 * one. Every field is checked for its own failure mode, never a thrown error.
 */

describe("reportQuerySchema", () => {
  it("defaults to last 30 days with no court or day when nothing is given", () => {
    expect(reportQuerySchema.parse({})).toEqual({ range: DEFAULT_REPORT_RANGE });
  });

  it("keeps a valid preset", () => {
    expect(reportQuerySchema.parse({ range: "this-week" }).range).toBe("this-week");
  });

  it("falls back to the default range for an unknown preset", () => {
    expect(reportQuerySchema.parse({ range: "last-fortnight" }).range).toBe(DEFAULT_REPORT_RANGE);
  });

  it("coerces a numeric court id from a query string", () => {
    expect(reportQuerySchema.parse({ court: "2" }).court).toBe(2);
  });

  it("falls back to undefined (all courts) for a non numeric court id", () => {
    expect(reportQuerySchema.parse({ court: "abc" }).court).toBeUndefined();
  });

  it("falls back to undefined for a zero or negative court id", () => {
    expect(reportQuerySchema.parse({ court: "0" }).court).toBeUndefined();
    expect(reportQuerySchema.parse({ court: "-1" }).court).toBeUndefined();
  });

  it("falls back to undefined for a non integer court id", () => {
    expect(reportQuerySchema.parse({ court: "1.5" }).court).toBeUndefined();
  });

  it("keeps a real calendar date for day", () => {
    expect(reportQuerySchema.parse({ day: "2026-09-17" }).day).toBe("2026-09-17");
  });

  it("falls back to undefined for a malformed day", () => {
    expect(reportQuerySchema.parse({ day: "not-a-date" }).day).toBeUndefined();
  });

  it("falls back to undefined for a day that does not exist", () => {
    expect(reportQuerySchema.parse({ day: "2026-02-30" }).day).toBeUndefined();
  });
});
