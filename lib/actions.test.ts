import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * Architecture rules 3 and 11: every Server Action checks Clerk first, then puts
 * its payload through a schema, before anything reaches the database. These
 * helpers are the shared front door, so every court write inherits whatever they
 * guarantee.
 */

const auth = vi.hoisted(() => vi.fn());
const staffSupabase = vi.hoisted(() => vi.fn(() => ({ marker: "staff client" })));
const reportFailure = vi.hoisted(() => vi.fn());
const captureStaffEvent = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/lib/supabase/staff", () => ({ staffSupabase }));
vi.mock("@/lib/analytics/server", () => ({ reportFailure, captureStaffEvent }));

const { describeDatabaseError, fail, ok, parseInput, requireStaff } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  staffSupabase.mockReturnValue({ marker: "staff client" });
});

describe("ok / fail", () => {
  it("wraps a value as a success result", () => {
    expect(ok({ id: "court-1" })).toEqual({ ok: true, data: { id: "court-1" } });
  });

  it("wraps an error as a failure result", () => {
    const error = { kind: "conflict" as const, message: "someone got there first" };
    expect(fail(error)).toEqual({ ok: false, error });
  });
});

describe("requireStaff", () => {
  it("hands back the staff id and a per request Supabase client when signed in", async () => {
    auth.mockResolvedValue({ isAuthenticated: true, userId: "user_abc" });

    const result = await requireStaff();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected a signed in result");
    expect(result.staffId).toBe("user_abc");
    expect(result.supabase).toEqual({ marker: "staff client" });
  });

  it("refuses when there is no Clerk session", async () => {
    auth.mockResolvedValue({ isAuthenticated: false, userId: null });

    const result = await requireStaff();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.error.kind).toBe("unauthenticated");
    expect(result.error.message).toBe("Sign in to change a court.");
  });

  it("refuses when Clerk reports authenticated but gives no user id", async () => {
    auth.mockResolvedValue({ isAuthenticated: true, userId: null });

    const result = await requireStaff();

    expect(result.ok).toBe(false);
  });

  it("never builds a Supabase client for a signed out caller", async () => {
    auth.mockResolvedValue({ isAuthenticated: false, userId: null });

    await requireStaff();

    // Rule 11: check Clerk BEFORE touching Supabase, so an expired session reads
    // as a typed error instead of an opaque policy denial.
    expect(staffSupabase).not.toHaveBeenCalled();
  });

  it("builds a fresh client on each call, never a shared singleton (rule 10)", async () => {
    auth.mockResolvedValue({ isAuthenticated: true, userId: "user_abc" });

    await requireStaff();
    await requireStaff();

    expect(staffSupabase).toHaveBeenCalledTimes(2);
  });
});

describe("parseInput", () => {
  const schema = z.object({ id: z.uuid(), version: z.int().positive() });

  it("returns the parsed data for a valid payload", () => {
    const input = { id: "1a78471a-a748-489b-ba8d-ea1b5b357a4e", version: 3 };
    const result = parseInput(schema, input);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected a parse success");
    expect(result.data).toEqual(input);
  });

  it("rejects a payload with a bad field and names that field", () => {
    const result = parseInput(schema, { id: "not-a-uuid", version: 3 });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a parse failure");
    expect(result.error.kind).toBe("invalid");
    expect(result.error).toHaveProperty("issues.id");
  });

  it("rejects a version of zero, because a row's version starts at one", () => {
    const result = parseInput(schema, {
      id: "1a78471a-a748-489b-ba8d-ea1b5b357a4e",
      version: 0,
    });
    expect(result.ok).toBe(false);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "id=1"],
    ["an array", []],
    ["an empty object", {}],
  ])("rejects %s, because a Server Action accepts whatever the network sends", (_label, input) => {
    expect(parseInput(schema, input).ok).toBe(false);
  });

  it("strips unknown keys rather than passing them through to the database", () => {
    const result = parseInput(schema, {
      id: "1a78471a-a748-489b-ba8d-ea1b5b357a4e",
      version: 3,
      is_admin: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected a parse success");
    expect(result.data).not.toHaveProperty("is_admin");
  });
});

describe("describeDatabaseError", () => {
  it("maps a row level security refusal (42501) to forbidden, never a raw failure (spec 0004, AC-5)", () => {
    expect(
      describeDatabaseError(
        { code: "42501", message: "permission denied for table reservation" },
        { action: "test" },
      ),
    ).toEqual({ kind: "forbidden", message: "Your account is not allowed to make that change." });
  });

  it("maps the overlap exclusion constraint to a slot_taken conflict", () => {
    const error = describeDatabaseError(
      {
        code: "23P01",
        message: 'conflicting key value violates exclusion constraint "reservation_no_overlap"',
      },
      { action: "test" },
    );
    expect(error).toMatchObject({ kind: "conflict", reason: "slot_taken" });
  });

  it("maps the live sort order index to a sort_order_taken conflict", () => {
    const error = describeDatabaseError(
      {
        code: "23505",
        message: 'duplicate key value violates unique constraint "court_live_sort_order_idx"',
      },
      { action: "test" },
    );
    expect(error).toMatchObject({ kind: "conflict", reason: "sort_order_taken" });
  });

  it.each(["PGRST301", "PGRST302", "PGRST303"])(
    "maps the PostgREST token refusal %s to unauthenticated, never a raw failure",
    (code) => {
      const error = describeDatabaseError(
        { code, message: "JWT not yet valid" },
        { action: "loadSettings", distinctId: "user_1" },
      );
      expect(error).toEqual({
        kind: "unauthenticated",
        message: "Your session has expired. Sign in again.",
      });
      expect(reportFailure).not.toHaveBeenCalled();
    },
  );

  it("counts a session refusal keyed on the code, without reporting an exception", () => {
    describeDatabaseError(
      { code: "PGRST303", message: "JWT not yet valid" },
      { action: "loadSettings", distinctId: "user_1" },
    );
    expect(captureStaffEvent).toHaveBeenCalledExactlyOnceWith("user_1", "staff_session_refused", {
      code: "PGRST303",
    });
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it("skips the session counter when no staff id is known (the public board)", () => {
    describeDatabaseError(
      { code: "PGRST303", message: "JWT not yet valid" },
      { action: "getSchedule" },
    );
    expect(captureStaffEvent).not.toHaveBeenCalled();
  });

  it("passes anything else through as failed with the database message", () => {
    expect(
      describeDatabaseError({ code: "XX000", message: "disk on fire" }, { action: "test" }),
    ).toEqual({
      kind: "failed",
      message: "disk on fire",
    });
  });

  /**
   * Spec 0009, AC-7: only the unnamed `failed` outcome is reported. Every
   * named conflict above is an expected outcome and must never reach
   * `reportFailure()`.
   */
  it("reports only the unnamed failed branch, never a named conflict (AC-7)", () => {
    describeDatabaseError({ code: "42501", message: "permission denied" }, { action: "test" });
    describeDatabaseError(
      { code: "23P01", message: 'exclusion constraint "reservation_no_overlap"' },
      { action: "test" },
    );
    expect(reportFailure).not.toHaveBeenCalled();

    describeDatabaseError(
      { code: "XX000", message: "disk on fire" },
      { action: "test", distinctId: "user_1" },
    );
    expect(reportFailure).toHaveBeenCalledExactlyOnceWith(
      { code: "XX000", message: "disk on fire" },
      { action: "test", distinctId: "user_1" },
    );
  });
});
