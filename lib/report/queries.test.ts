import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0008: `getUsageReport` and `getDayReservations` both run through
 * `requireStaff()` first, then `staffSupabase()`. `court_usage`'s own owner
 * check is the real enforcement point (AC-4); what's under test here is that
 * a signed out caller never reaches it, that a database error is mapped to
 * the right typed result, and that the local day filter and name lookups are
 * correct.
 */

const requireStaff = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/actions")>();
  return { ...actual, requireStaff };
});

type Answer = { data: unknown; error: unknown };
const answers = new Map<string, Answer[]>();
const queue = (key: string, value: Answer) =>
  answers.set(key, [...(answers.get(key) ?? []), value]);
const nextAnswer = (key: string): Answer =>
  (answers.get(key) ?? []).shift() ?? { data: null, error: null };

function builder(table: string) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "lt", "gt", "order"]) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = () => Promise.resolve(nextAnswer(table));
  chain.then = (resolve: (value: Answer) => void) => resolve(nextAnswer(table));
  return chain;
}

const rpc = vi.fn(() => Promise.resolve(nextAnswer("rpc")));
const supabase = { from: (table: string) => builder(table), rpc };

const { getDayReservations, getUsageReport } = await import("./queries");

beforeEach(() => {
  vi.clearAllMocks();
  answers.clear();
  requireStaff.mockResolvedValue({ ok: true, staffId: "user_a", supabase });
});

const COURTS_ROW = {
  data: [
    { id: 1, name: "Court 1", sort_order: 0, retired_at: null },
    { id: 2, name: "Court 2", sort_order: 1, retired_at: null },
  ],
  error: null,
};

/** The seven rows of `venue_hours`, as Postgres hands `time` back (spec 0007, AC-23). */
const HOURS_ROW = {
  data: [0, 1, 2, 3, 4, 5, 6].map((day_of_week) => ({
    day_of_week,
    open_time: day_of_week === 0 || day_of_week === 6 ? "06:00:00" : "08:00:00",
    close_time: day_of_week === 0 || day_of_week === 6 ? "24:00:00" : "22:00:00",
  })),
  error: null,
};

describe("getUsageReport", () => {
  it("refuses a signed out caller without touching supabase", async () => {
    requireStaff.mockResolvedValue({
      ok: false,
      error: { kind: "unauthenticated", message: "Sign in to change a court." },
    });
    const result = await getUsageReport({ range: "last-7-days" });
    expect(result).toEqual({
      ok: false,
      error: { kind: "unauthenticated", message: "Sign in to change a court." },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the resolved range, mapped usage rows, courts and trimmed hours", async () => {
    queue("rpc", {
      data: [{ court_id: 1, local_date: "2026-09-17", hour: 9, booked_minutes: 45 }],
      error: null,
    });
    queue("court", COURTS_ROW);
    queue("venue_hours", HOURS_ROW);

    const result = await getUsageReport({ range: "last-7-days", courtId: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toEqual([
      { courtId: 1, localDate: "2026-09-17", hour: 9, bookedMinutes: 45 },
    ]);
    expect(result.data.courts).toEqual([
      { id: 1, name: "Court 1", sortOrder: 0, retiredAt: null },
      { id: 2, name: "Court 2", sortOrder: 1, retiredAt: null },
    ]);
    expect(result.data.hours).toEqual({
      days: [
        { dayOfWeek: 0, open: "06:00", close: "24:00" },
        { dayOfWeek: 1, open: "08:00", close: "22:00" },
        { dayOfWeek: 2, open: "08:00", close: "22:00" },
        { dayOfWeek: 3, open: "08:00", close: "22:00" },
        { dayOfWeek: 4, open: "08:00", close: "22:00" },
        { dayOfWeek: 5, open: "08:00", close: "22:00" },
        { dayOfWeek: 6, open: "06:00", close: "24:00" },
      ],
    });
    expect(rpc).toHaveBeenCalledWith("court_usage", {
      from_date: result.data.from,
      to_date: result.data.to,
      for_court_id: 1,
    });
  });

  it("passes for_court_id as undefined for all courts", async () => {
    queue("rpc", { data: [], error: null });
    queue("court", COURTS_ROW);
    queue("venue_hours", HOURS_ROW);

    await getUsageReport({ range: "last-7-days" });
    expect(rpc).toHaveBeenCalledWith(
      "court_usage",
      expect.objectContaining({ for_court_id: undefined }),
    );
  });

  it("maps a 42501 from court_usage to a forbidden result, not a raw database error", async () => {
    queue("rpc", { data: null, error: { code: "42501", message: "permission denied" } });
    queue("court", COURTS_ROW);
    queue("venue_hours", HOURS_ROW);

    const result = await getUsageReport({ range: "last-7-days" });
    expect(result).toEqual({
      ok: false,
      error: { kind: "forbidden", message: "Your account is not allowed to read this report." },
    });
  });

  it("maps any other court_usage error to a failed result carrying the raw message", async () => {
    queue("rpc", {
      data: null,
      error: { code: "57014", message: "canceling statement due to timeout" },
    });
    queue("court", COURTS_ROW);
    queue("venue_hours", HOURS_ROW);

    const result = await getUsageReport({ range: "last-7-days" });
    expect(result).toEqual({
      ok: false,
      error: { kind: "failed", message: "canceling statement due to timeout" },
    });
  });

  it("fails when the seven opening hours rows are not all there", async () => {
    queue("rpc", { data: [], error: null });
    queue("court", COURTS_ROW);
    queue("venue_hours", { data: HOURS_ROW.data.slice(0, 5), error: null });

    const result = await getUsageReport({ range: "last-7-days" });
    expect(result).toEqual({
      ok: false,
      error: { kind: "failed", message: "The venue opening hours are missing." },
    });
  });

  it("fails when the court read errors", async () => {
    queue("rpc", { data: [], error: null });
    queue("court", { data: null, error: { message: "connection reset" } });
    queue("venue_hours", HOURS_ROW);

    const result = await getUsageReport({ range: "last-7-days" });
    expect(result).toEqual({ ok: false, error: { kind: "failed", message: "connection reset" } });
  });
});

function reservationRow(partial: Record<string, unknown>) {
  return {
    id: 1,
    court_id: 1,
    kind: "booking",
    status: "active",
    starts_at: "2026-09-17T02:00:00Z",
    ends_at: "2026-09-17T04:00:00Z",
    customer_name: "Maria",
    note: null,
    created_by: "user_a",
    cancelled_by: null,
    cancelled_at: null,
    ...partial,
  };
}

const STAFF_ROWS = {
  data: [
    { user_id: "user_a", display_name: "Ella" },
    { user_id: "user_b", display_name: "Sean" },
  ],
  error: null,
};

describe("getDayReservations", () => {
  it("refuses a signed out caller without touching supabase", async () => {
    requireStaff.mockResolvedValue({
      ok: false,
      error: { kind: "unauthenticated", message: "Sign in to change a court." },
    });
    const result = await getDayReservations("2026-09-17");
    expect(result.ok).toBe(false);
  });

  it("keeps a row that falls inside the venue local day (Asia/Manila, UTC+8)", async () => {
    queue("court", { data: [{ id: 1, name: "Court 1", sort_order: 0 }], error: null });
    queue("staff", STAFF_ROWS);
    // 2026-09-17T02:00Z to 04:00Z is 10am to noon Manila on the 17th.
    queue("reservation", { data: [reservationRow({})], error: null });

    const result = await getDayReservations("2026-09-17");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      courtName: "Court 1",
      startTime: "10:00",
      endTime: "12:00",
      customerName: "Maria",
      createdByName: "Ella",
    });
  });

  it("drops a row that only touches a neighbouring venue day, despite the wider UTC fetch window", async () => {
    queue("court", { data: [{ id: 1, name: "Court 1", sort_order: 0 }], error: null });
    queue("staff", STAFF_ROWS);
    // 10am to noon Manila on the 16th: wholly on the day before.
    queue("reservation", {
      data: [
        reservationRow({ starts_at: "2026-09-16T02:00:00Z", ends_at: "2026-09-16T04:00:00Z" }),
      ],
      error: null,
    });

    const result = await getDayReservations("2026-09-17");
    expect(result).toEqual({ ok: true, data: [] });
  });

  it("keeps a row that spans across the requested day, even with neither edge landing on it", async () => {
    queue("court", { data: [{ id: 1, name: "Court 1", sort_order: 0 }], error: null });
    queue("staff", STAFF_ROWS);
    // Starts the 16th, ends the 18th: covers the whole 17th without an edge on it.
    queue("reservation", {
      data: [
        reservationRow({ starts_at: "2026-09-15T20:00:00Z", ends_at: "2026-09-17T20:00:00Z" }),
      ],
      error: null,
    });

    const result = await getDayReservations("2026-09-17");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
  });

  it("sorts by court sort order, then start time", async () => {
    queue("court", {
      data: [
        { id: 1, name: "Court 1", sort_order: 1 },
        { id: 2, name: "Court 2", sort_order: 0 },
      ],
      error: null,
    });
    queue("staff", STAFF_ROWS);
    queue("reservation", {
      data: [
        reservationRow({
          id: 1,
          court_id: 1,
          starts_at: "2026-09-17T01:00:00Z",
          ends_at: "2026-09-17T02:00:00Z",
        }),
        reservationRow({
          id: 2,
          court_id: 2,
          starts_at: "2026-09-17T03:00:00Z",
          ends_at: "2026-09-17T04:00:00Z",
        }),
      ],
      error: null,
    });

    const result = await getDayReservations("2026-09-17");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((row) => row.id)).toEqual([2, 1]);
  });

  it("shows who cancelled a row and when, and falls back to null for an unknown actor", async () => {
    queue("court", { data: [{ id: 1, name: "Court 1", sort_order: 0 }], error: null });
    queue("staff", STAFF_ROWS);
    queue("reservation", {
      data: [
        reservationRow({
          status: "cancelled",
          cancelled_by: "user_gone",
          cancelled_at: "2026-09-16T10:00:00Z",
        }),
      ],
      error: null,
    });

    const result = await getDayReservations("2026-09-17");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toMatchObject({
      status: "cancelled",
      cancelledByName: null,
      cancelledAt: "2026-09-16T10:00:00Z",
    });
  });

  it("falls back to Unknown court for a court id with no matching row", async () => {
    queue("court", { data: [], error: null });
    queue("staff", STAFF_ROWS);
    queue("reservation", { data: [reservationRow({})], error: null });

    const result = await getDayReservations("2026-09-17");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0].courtName).toBe("Unknown court");
  });

  it("fails when the reservation read errors", async () => {
    queue("court", { data: [], error: null });
    queue("staff", STAFF_ROWS);
    queue("reservation", { data: null, error: { message: "connection reset" } });

    const result = await getDayReservations("2026-09-17");
    expect(result).toEqual({ ok: false, error: { kind: "failed", message: "connection reset" } });
  });
});
