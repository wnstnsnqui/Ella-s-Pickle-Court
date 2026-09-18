import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0004, AC-3 and AC-8: `currentStaff()` turns Clerk's answer and the
 * `ensure_staff()` call into one of three typed results, never throws, and
 * never lets a slow database hold the board.
 */

const auth = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const cache = vi.hoisted(() => vi.fn(<F>(fn: F) => fn));

vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/lib/supabase/staff", () => ({ staffSupabase: () => ({ rpc, from }) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache,
}));

const { currentStaff, ENSURE_STAFF_TIMEOUT_MS, getAllStaff } = await import("./staff");

/** A stand in for the PostgREST builder chain `from().select().order()`. */
function fromSelecting(result: {
  data: unknown[] | null;
  error: { code?: string; message: string } | null;
}) {
  const order = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ order }));
  from.mockReturnValue({ select });
  return { select, order };
}

type Row = {
  display_name: string;
  role: string;
  is_active: boolean;
  privacy_acknowledged_version?: string | null;
};

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
  from.mockReset();
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
    rpcResolving({
      data: {
        display_name: "Ella",
        role: "owner",
        is_active: true,
        privacy_acknowledged_version: null,
      },
      error: null,
    });

    expect(await currentStaff()).toEqual({
      kind: "ok",
      staff: {
        displayName: "Ella",
        role: "owner",
        isActive: true,
        privacyAcknowledgedVersion: null,
      },
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

  it("passes the role column through unchanged, admin and superadmin included (spec 0012)", async () => {
    auth.mockResolvedValue({ isAuthenticated: true });
    rpcResolving({ data: { display_name: "X", role: "admin", is_active: true }, error: null });

    const result = await currentStaff();
    if (result.kind === "ok") expect(result.staff.role).toBe("admin");
    else expect.fail("expected an ok result");
  });
});

describe("getAllStaff", () => {
  /** Rows out of DB order on purpose, to prove the function does the sorting. */
  const ROWS = [
    {
      clerk_user_id: "a",
      display_name: "Amy",
      email: null,
      role: "staff",
      is_active: true,
      last_signed_in_at: null,
      version: 1,
    },
    {
      clerk_user_id: "b",
      display_name: "Bo",
      email: null,
      role: "admin",
      is_active: true,
      last_signed_in_at: null,
      version: 1,
    },
    {
      clerk_user_id: "c",
      display_name: "Cy",
      email: null,
      role: "owner",
      is_active: true,
      last_signed_in_at: null,
      version: 1,
    },
    {
      clerk_user_id: "d",
      display_name: "Al",
      email: null,
      role: "superadmin",
      is_active: true,
      last_signed_in_at: null,
      version: 1,
    },
    {
      clerk_user_id: "e",
      display_name: "Zed",
      email: null,
      role: "superadmin",
      is_active: true,
      last_signed_in_at: null,
      version: 1,
    },
  ];

  it("sorts owner, then superadmin, then admin, then staff, alphabetically within a role", async () => {
    auth.mockResolvedValue({ isAuthenticated: true, userId: "caller_1" });
    fromSelecting({ data: ROWS, error: null });

    const result = await getAllStaff();
    if (!result.ok) return expect.fail("expected an ok result");
    expect(result.data.map((row) => row.displayName)).toEqual(["Cy", "Al", "Zed", "Bo", "Amy"]);
  });
});
