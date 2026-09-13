import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0004, AC-3 and AC-8: `currentStaff()` turns Clerk's answer and the
 * `ensure_staff()` call into one of three typed results, never throws, and
 * never lets a slow database hold the board.
 */

const auth = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const cache = vi.hoisted(() => vi.fn(<F>(fn: F) => fn));

vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/lib/supabase/staff", () => ({ staffSupabase: () => ({ rpc }) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache,
}));

const { currentStaff, ENSURE_STAFF_TIMEOUT_MS } = await import("./staff");

type Row = { display_name: string; role: string; is_active: boolean };

/** A stand in for the PostgREST builder chain `rpc().abortSignal().single()`. */
function rpcResolving(result: {
  data: Row | null;
  error: { code?: string; message: string } | null;
}) {
  const single = vi.fn().mockResolvedValue(result);
  const abortSignal = vi.fn(() => ({ single }));
  rpc.mockReturnValue({ abortSignal });
  return { abortSignal, single };
}

beforeEach(() => {
  // Not `clearAllMocks`: the `cache()` call happened once, at import time.
  auth.mockReset();
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("currentStaff", () => {
  it("is memoised per request with React cache()", () => {
    expect(cache).toHaveBeenCalledTimes(1);
    expect(cache).toHaveBeenCalledWith(expect.any(Function));
  });

  it("answers signed_out without touching the database (AC-6)", async () => {
    auth.mockResolvedValue({ isAuthenticated: false });

    expect(await currentStaff()).toEqual({ kind: "signed_out" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls ensure_staff with no arguments and returns the row it made (AC-3)", async () => {
    auth.mockResolvedValue({ isAuthenticated: true });
    rpcResolving({ data: { display_name: "Ella", role: "owner", is_active: true }, error: null });

    expect(await currentStaff()).toEqual({
      kind: "ok",
      staff: { displayName: "Ella", role: "owner", isActive: true },
    });
    expect(rpc).toHaveBeenCalledWith("ensure_staff");
    expect(rpc.mock.calls[0]).toHaveLength(1);
  });

  it("carries an inactive account through as ok with isActive false (AC-5)", async () => {
    auth.mockResolvedValue({ isAuthenticated: true });
    rpcResolving({ data: { display_name: "Sam", role: "staff", is_active: false }, error: null });

    const result = await currentStaff();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.staff.isActive).toBe(false);
  });

  it("gives the call a 3 second abort so a slow database never holds the board (AC-8)", async () => {
    auth.mockResolvedValue({ isAuthenticated: true });
    const { abortSignal } = rpcResolving({
      data: { display_name: "Ella", role: "owner", is_active: true },
      error: null,
    });

    await currentStaff();

    expect(ENSURE_STAFF_TIMEOUT_MS).toBe(3000);
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("turns a Postgres error result into error and logs it (AC-8)", async () => {
    auth.mockResolvedValue({ isAuthenticated: true });
    rpcResolving({
      data: null,
      error: { code: "23514", message: "the session token carries no name or email" },
    });

    expect(await currentStaff()).toEqual({ kind: "error" });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/currentStaff.*23514.*no name or email/),
    );
  });

  it("turns a thrown call, such as the abort firing, into error (AC-8)", async () => {
    auth.mockResolvedValue({ isAuthenticated: true });
    const single = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    rpc.mockReturnValue({ abortSignal: () => ({ single }) });

    expect(await currentStaff()).toEqual({ kind: "error" });
    expect(console.error).toHaveBeenCalled();
  });

  it("never reports a role other than staff or owner", async () => {
    auth.mockResolvedValue({ isAuthenticated: true });
    rpcResolving({ data: { display_name: "X", role: "admin", is_active: true }, error: null });

    const result = await currentStaff();
    if (result.kind === "ok") expect(result.staff.role).toBe("staff");
    else expect.fail("expected an ok result");
  });
});
