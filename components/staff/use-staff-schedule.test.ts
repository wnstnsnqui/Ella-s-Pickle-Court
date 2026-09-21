import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Spec 0004 (revised), AC-12: the staff board listens through the same anon
 * browser client the public board uses, applies no token to the socket, and
 * has no second client module to reach for. The hook itself needs a mounted
 * React tree; what is pinned here is the shape of its source.
 */

const source = readFileSync(new URL("./use-staff-schedule.ts", import.meta.url), "utf8");

describe("useStaffSchedule", () => {
  it("uses browserSupabase() and nothing else", () => {
    expect(source).toContain('from "@/lib/supabase/browser"');
    expect(source).not.toContain("staff-browser");
  });

  it("never calls realtime.setAuth() and hands no prepare step to the channel", () => {
    expect(source).not.toContain("setAuth");
    expect(source).not.toMatch(/prepare\s*[:,]/);
  });

  it("still refetches through the session bound Server Action on every broadcast", () => {
    expect(source).toContain("refreshStaffSchedule({ date: day })");
  });
});
