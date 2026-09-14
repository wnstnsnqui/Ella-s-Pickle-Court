import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0005, AC-7 and AC-2: the staff read carries the whole staff list
 * (active or not), the horizon for the day navigation, and both timestamps
 * the details sheet shows; cancelled rows are returned for the record but
 * never occupy a cell. Supabase is the boundary and is faked with queued answers.
 */

const auth = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth }));

type Call = { table: string; method: string; args: unknown[] };
const calls: Call[] = [];
const answers = new Map<string, unknown[]>();
const queue = (table: string, value: unknown) =>
  answers.set(table, [...(answers.get(table) ?? []), value]);

function builder(table: string) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "lt", "gt", "is", "order", "maybeSingle"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ table, method, args });
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => void) =>
    resolve((answers.get(table) ?? []).shift() ?? { data: null, error: null });
  return chain;
}

const staffSupabase = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/staff", () => ({ staffSupabase }));
vi.mock("@/lib/supabase/public", () => ({ publicSupabase: vi.fn() }));

const { getStaffSchedule } = await import("./queries");

const SETTINGS_ROW = {
  weekday_open: "06:00:00",
  weekday_close: "22:00:00",
  weekend_open: "06:00:00",
  weekend_close: "23:00:00",
  slot_minutes: 60,
  booking_horizon_days: 30,
  timezone: "Asia/Manila",
  version: 1,
};

function reservationRow(partial: Record<string, unknown>) {
  return {
    id: 1,
    court_id: 1,
    kind: "booking",
    status: "active",
    starts_at: "2026-09-15T08:00:00+00:00",
    ends_at: "2026-09-15T09:00:00+00:00",
    customer_name: "Maria",
    customer_phone: null,
    note: null,
    payment_status: "unpaid",
    amount: null,
    version: 1,
    created_by: "user_a",
    changed_by: "user_a",
    created_at: "2026-09-14T07:00:00+00:00",
    updated_at: "2026-09-14T07:30:00+00:00",
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  answers.clear();
  auth.mockResolvedValue({ isAuthenticated: true, userId: "user_a" });
  staffSupabase.mockReturnValue({ from: (table: string) => builder(table) });
  queue("venue_settings", { data: SETTINGS_ROW, error: null });
  queue("court", {
    data: [
      { id: 1, name: "Court 1", note: null, sort_order: 1 },
      { id: 2, name: "Court 2", note: null, sort_order: 2 },
    ],
    error: null,
  });
});

describe("getStaffSchedule", () => {
  it("refuses a signed out caller (AC-12 enforcement point stays the policy, this is the typed answer)", async () => {
    auth.mockResolvedValue({ isAuthenticated: false, userId: null });
    const result = await getStaffSchedule("2026-09-15");
    expect(result).toMatchObject({ ok: false, error: { kind: "unauthenticated" } });
  });

  it("returns every staff row as names, with no is_active filter, plus the horizon (AC-7, AC-2)", async () => {
    queue("reservation", { data: [], error: null });
    queue("staff", {
      data: [
        { clerk_user_id: "user_a", display_name: "Ella" },
        { clerk_user_id: "user_leaver", display_name: "Old Staff" },
      ],
      error: null,
    });

    const result = await getStaffSchedule("2026-09-15");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.staff).toEqual([
      { clerkUserId: "user_a", displayName: "Ella" },
      { clerkUserId: "user_leaver", displayName: "Old Staff" },
    ]);
    expect(result.data.horizonDays).toBe(30);
    const staffSelect = calls.find((call) => call.table === "staff" && call.method === "select");
    expect(staffSelect?.args[0]).toBe("clerk_user_id, display_name");
    expect(calls.some((call) => call.table === "staff" && call.method === "eq")).toBe(false);
  });

  it("carries both timestamps and the writer ids on each reservation (AC-7)", async () => {
    queue("reservation", { data: [reservationRow({})], error: null });
    queue("staff", { data: [], error: null });

    const result = await getStaffSchedule("2026-09-15");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.reservations[0]).toMatchObject({
      id: 1,
      createdBy: "user_a",
      changedBy: "user_a",
      createdAt: "2026-09-14T07:00:00+00:00",
      updatedAt: "2026-09-14T07:30:00+00:00",
      customerName: "Maria",
    });
  });

  it("keeps a cancelled row in the list but frees its cell (AC-9)", async () => {
    queue("reservation", {
      data: [
        reservationRow({ id: 1, status: "cancelled" }),
        reservationRow({ id: 2, court_id: 2 }),
      ],
      error: null,
    });
    queue("staff", { data: [], error: null });

    const result = await getStaffSchedule("2026-09-15");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.reservations.map((row) => row.status)).toEqual(["cancelled", "active"]);
    // 4pm Manila is 08:00Z: the row whose start is that instant.
    const fourPm = result.data.grid.rows.find((row) => row.label === "16:00");
    expect(fourPm?.cells.map((cell) => cell.state)).toEqual(["available", "booked"]);
  });

  it("refuses a day past the horizon with the last allowed date in the message (AC-14)", async () => {
    const result = await getStaffSchedule("2031-01-01");
    expect(result).toMatchObject({ ok: false, error: { kind: "invalid" } });
    if (result.ok) return;
    expect(result.error.message).toMatch(/only goes as far as \d{4}-\d{2}-\d{2}/);
  });

  it("passes a staff list read error through rather than showing a grid with no names", async () => {
    queue("reservation", { data: [], error: null });
    queue("staff", { data: null, error: { message: "permission denied for table staff" } });

    const result = await getStaffSchedule("2026-09-15");

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "failed", message: "permission denied for table staff" },
    });
  });
});
