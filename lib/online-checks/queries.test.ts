import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0016, AC-1, AC-2, AC-3 and AC-6: what the staff check's reads hand the
 * board. The counts come from Postgres, never from the length of a capped
 * list; To check sorts by the first active slot; a booking's runs are the rows
 * that stand for it (a retake's, not a lapsed hold's); and the details sheet
 * names who decided. The session and Supabase are the boundaries and are faked
 * with queued answers per table; the policies are proven against Postgres in
 * `supabase/tests/online_checks.test.ts`.
 */

const requireStaff = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/actions")>()),
  requireStaff,
}));
const reportFailure = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/server", () => ({ reportFailure, captureStaffEvent: vi.fn() }));

type Call = { table: string; method: string; args: unknown[] };
const calls: Call[] = [];
const answers = new Map<string, unknown[]>();
const queue = (table: string, value: unknown) =>
  answers.set(table, [...(answers.get(table) ?? []), value]);

function builder(table: string) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit", "maybeSingle"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ table, method, args });
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => void) =>
    resolve((answers.get(table) ?? []).shift() ?? { data: null, error: null });
  return chain;
}

const supabase = { from: (table: string) => builder(table) };

const { getBookingIdByCode, getOnlineChecks, getProofPath, getStaffBooking, standingRows } =
  await import("./queries");

const COURTS = {
  data: [
    { id: 1, name: "Court 1" },
    { id: 2, name: "Court 2" },
  ],
  error: null,
};

type Row = {
  court_id: number;
  starts_at: string;
  ends_at: string;
  status: string;
  created_at: string;
};

const row = (starts_at: string, ends_at: string, overrides: Partial<Row> = {}): Row => ({
  court_id: 2,
  starts_at,
  ends_at,
  status: "active",
  created_at: "2026-10-29T01:00:00Z",
  ...overrides,
});

const listRow = (id: number, reservation: Row[], overrides: Record<string, unknown> = {}) => ({
  id,
  code: `CODE000${id}`,
  customer_name: "Lea Cruz",
  amount: "500.00",
  reference_last4: "1234",
  status: "pending_check",
  refund_status: null,
  submitted_at: "2026-10-29T02:00:00Z",
  reservation,
  ...overrides,
});

beforeEach(() => {
  calls.length = 0;
  answers.clear();
  vi.clearAllMocks();
  requireStaff.mockResolvedValue({ ok: true, staffId: "staff-1", supabase });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("standingRows", () => {
  it("takes the active rows of a booking that still holds its slots", () => {
    const active = row("2026-10-30T10:00:00Z", "2026-10-30T11:00:00Z");
    const lapsed = row("2026-10-30T08:00:00Z", "2026-10-30T09:00:00Z", { status: "cancelled" });

    expect(standingRows("pending_check", [lapsed, active])).toEqual([active]);
    expect(standingRows("confirmed", [lapsed, active])).toEqual([active]);
    expect(standingRows("held", [lapsed, active])).toEqual([active]);
  });

  it("takes the retake's rows, not the lapsed hold's, once a booking has ended", () => {
    const hold = row("2026-10-30T08:00:00Z", "2026-10-30T09:00:00Z", {
      status: "cancelled",
      created_at: "2026-10-29T01:00:00Z",
    });
    const retake = row("2026-10-30T10:00:00Z", "2026-10-30T11:00:00Z", {
      status: "cancelled",
      created_at: "2026-10-29T01:10:00Z",
    });

    expect(standingRows("rejected", [retake, hold])).toEqual([retake]);
  });

  it("falls back to the last batch when an unchecked booking has no active row left", () => {
    const first = row("2026-10-30T08:00:00Z", "2026-10-30T09:00:00Z", {
      status: "cancelled",
      created_at: "2026-10-29T01:00:00Z",
    });
    const second = row("2026-10-30T09:00:00Z", "2026-10-30T10:00:00Z", {
      status: "cancelled",
      created_at: "2026-10-29T01:00:00Z",
    });

    expect(standingRows("pending_check", [first, second])).toEqual([first, second]);
  });

  it("answers no rows for a booking that has none", () => {
    expect(standingRows("expired", [])).toEqual([]);
  });
});

describe("getOnlineChecks", () => {
  function answer(
    pending: unknown[],
    refunds: unknown[],
    counts = { pending: pending.length, refunds: refunds.length },
  ) {
    queue("booking", { data: pending, count: counts.pending, error: null });
    queue("booking", { data: refunds, count: counts.refunds, error: null });
    queue("court", COURTS);
  }

  it("puts a started booking on top, then the soonest first slot, then one with no active slot (AC-2, AC-16)", async () => {
    answer(
      [
        listRow(1, [row("2026-10-31T10:00:00Z", "2026-10-31T11:00:00Z")]),
        listRow(2, [row("2026-10-30T01:00:00Z", "2026-10-30T02:00:00Z", { status: "cancelled" })]),
        listRow(3, [row("2026-10-29T23:00:00Z", "2026-10-30T00:00:00Z")]),
        listRow(4, [row("2026-10-30T10:00:00Z", "2026-10-30T11:00:00Z")]),
      ],
      [],
    );

    const result = await getOnlineChecks();

    expect(result.ok && result.data.toCheck.map((item) => item.bookingId)).toEqual([3, 4, 1, 2]);
  });

  it("reads the first active slot from active rows only, for the time tag (AC-16)", async () => {
    answer(
      [
        listRow(1, [
          row("2026-10-30T08:00:00Z", "2026-10-30T09:00:00Z", { status: "cancelled" }),
          row("2026-10-30T11:00:00Z", "2026-10-30T12:00:00Z"),
          row("2026-10-30T10:00:00Z", "2026-10-30T11:00:00Z"),
        ]),
      ],
      [],
    );

    const result = await getOnlineChecks();

    expect(result.ok && result.data.toCheck[0].firstActiveStartsAt).toBe("2026-10-30T10:00:00Z");
  });

  it("hands each item its name, code, amount, digits and merged runs on named courts (AC-2)", async () => {
    answer(
      [
        listRow(1, [
          row("2026-10-30T11:00:00Z", "2026-10-30T12:00:00Z"),
          row("2026-10-30T10:00:00Z", "2026-10-30T11:00:00Z"),
          row("2026-10-31T10:00:00Z", "2026-10-31T11:00:00Z", { court_id: 9 }),
        ]),
      ],
      [],
    );

    const result = await getOnlineChecks();

    expect(result.ok && result.data.toCheck[0]).toEqual({
      bookingId: 1,
      code: "CODE0001",
      customerName: "Lea Cruz",
      amount: 500,
      referenceLast4: "1234",
      status: "pending_check",
      refundStatus: null,
      submittedAt: "2026-10-29T02:00:00Z",
      runs: [
        {
          courtId: 2,
          courtName: "Court 2",
          startsAt: "2026-10-30T10:00:00Z",
          endsAt: "2026-10-30T12:00:00Z",
        },
        {
          courtId: 9,
          courtName: "Court",
          startsAt: "2026-10-31T10:00:00Z",
          endsAt: "2026-10-31T11:00:00Z",
        },
      ],
      firstActiveStartsAt: "2026-10-30T10:00:00Z",
    });
  });

  it("counts from Postgres, not from the list, and caps each section at 50 (AC-1, AC-2)", async () => {
    const pending = Array.from({ length: 51 }, (_, i) =>
      listRow(i + 1, [row("2026-10-30T10:00:00Z", "2026-10-30T11:00:00Z")]),
    );
    const refunds = Array.from({ length: 50 }, (_, i) =>
      listRow(100 + i, [], { status: "rejected", refund_status: "owed" }),
    );
    answer(pending, refunds, { pending: 51, refunds: 63 });

    const result = await getOnlineChecks();

    expect(result.ok && result.data.toCheck).toHaveLength(50);
    expect(result.ok && result.data.toCheckCount).toBe(51);
    expect(result.ok && result.data.refundCount).toBe(63);
    expect(result.ok && result.data.more).toEqual({ toCheck: true, refunds: true });
  });

  it("says nothing more waits when each section fits", async () => {
    answer([], [listRow(1, [], { status: "expired", refund_status: "owed" })]);

    const result = await getOnlineChecks();

    expect(result.ok && result.data.more).toEqual({ toCheck: false, refunds: false });
    expect(result.ok && result.data.refundsOwed[0].refundStatus).toBe("owed");
  });

  it("asks for unchecked bookings and for refunds owed oldest first, 50 at most (AC-2)", async () => {
    answer([], []);

    await getOnlineChecks();

    const booking = calls.filter((call) => call.table === "booking");
    expect(booking).toContainEqual({
      table: "booking",
      method: "eq",
      args: ["status", "pending_check"],
    });
    expect(booking).toContainEqual({
      table: "booking",
      method: "eq",
      args: ["refund_status", "owed"],
    });
    expect(booking).toContainEqual({
      table: "booking",
      method: "order",
      args: ["submitted_at", { ascending: true, nullsFirst: false }],
    });
    expect(booking).toContainEqual({ table: "booking", method: "limit", args: [50] });
  });

  it("stamps the read with the server's clock, so the time tags never trust the device (AC-16)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T09:30:00Z"));
    answer([], []);

    const result = await getOnlineChecks();

    expect(result.ok && result.data.serverNow).toBe("2026-10-30T09:30:00.000Z");
  });

  it("answers a failed read with one error, for the list's Try again notice (AC-2)", async () => {
    queue("booking", { data: null, count: null, error: { code: "57014", message: "timeout" } });
    queue("booking", { data: [], count: 0, error: null });
    queue("court", COURTS);

    const result = await getOnlineChecks();

    expect(result.ok).toBe(false);
  });

  it("never reads for a signed out caller", async () => {
    requireStaff.mockResolvedValue({
      ok: false,
      error: { kind: "unauthorized", message: "Sign in." },
    });

    const result = await getOnlineChecks();

    expect(result).toEqual({ ok: false, error: { kind: "unauthorized", message: "Sign in." } });
    expect(calls).toEqual([]);
  });
});

describe("getStaffBooking (AC-6)", () => {
  const BOOKING = {
    id: 7,
    code: "K7MQ3XPT",
    status: "rejected",
    version: 5,
    amount: "1000.00",
    customer_name: "Lea Cruz",
    customer_phone: "+639171234567",
    customer_email: "lea@example.com",
    reference_last4: "1234",
    submitted_at: "2026-10-29T02:00:00Z",
    refund_status: "refunded",
    refund_amount: "500.00",
    refunded_at: "2026-10-31T01:00:00Z",
    refunded_by: "admin-1",
    proof_path: null,
    reservation: [row("2026-10-30T10:00:00Z", "2026-10-30T12:00:00Z", { status: "cancelled" })],
  };
  const STAFF = [
    { user_id: "admin-1", display_name: "Ana Reyes", role: "admin", is_active: true },
    { user_id: "leaver-1", display_name: "Ben", role: "admin", is_active: false },
    { user_id: "staff-1", display_name: "Jo", role: "staff", is_active: true },
  ];
  const EVENTS = [
    {
      id: 2,
      kind: "refunded",
      reason: null,
      note: null,
      refund_owed: null,
      amount: "500.00",
      staff_id: "admin-1",
      created_at: "2026-10-31T01:00:00Z",
    },
    {
      id: 1,
      kind: "rejected",
      reason: "amount_mismatch",
      note: "Sent 500",
      refund_owed: true,
      amount: null,
      staff_id: "leaver-1",
      created_at: "2026-10-30T01:00:00Z",
    },
  ];

  function answer(booking: unknown = BOOKING, staff = STAFF, events = EVENTS) {
    queue("booking", { data: booking, error: null });
    queue("booking_event", { data: events, error: null });
    queue("staff", { data: staff, error: null });
    queue("court", COURTS);
  }

  it("hands the sheet the booking, its refund line and its runs, never the proof path", async () => {
    answer();

    const result = await getStaffBooking(7);

    expect(result.ok && result.data).toMatchObject({
      id: 7,
      code: "K7MQ3XPT",
      status: "rejected",
      version: 5,
      amount: 1000,
      refundStatus: "refunded",
      refundAmount: 500,
      refundedAt: "2026-10-31T01:00:00Z",
      refundedByName: "Ana",
      hasProof: false,
      runs: [
        {
          courtId: 2,
          courtName: "Court 2",
          startsAt: "2026-10-30T10:00:00Z",
          endsAt: "2026-10-30T12:00:00Z",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("proof_path");
  });

  it("reads History newest first and names a leaver on what they decided", async () => {
    answer();

    const result = await getStaffBooking(7);

    expect(result.ok && result.data.events.map((event) => [event.kind, event.staffName])).toEqual([
      ["refunded", "Ana"],
      ["rejected", "Ben"],
    ]);
    expect(result.ok && result.data.events[0].amount).toBe(500);
    expect(calls).toContainEqual({
      table: "booking_event",
      method: "order",
      args: ["created_at", { ascending: false }],
    });
  });

  it("names a decider missing from the staff list as a staff member", async () => {
    answer(
      BOOKING,
      STAFF.filter((person) => person.user_id !== "admin-1"),
    );

    const result = await getStaffBooking(7);

    expect(result.ok && result.data.refundedByName).toBe("a staff member");
  });

  it.each([
    ["an active admin", "admin-1", true],
    ["plain staff", "staff-1", false],
    ["an admin who has left", "leaver-1", false],
    ["someone with no staff row", "nobody", false],
  ])("answers whether %s may decide", async (_label, staffId, canDecide) => {
    requireStaff.mockResolvedValue({ ok: true, staffId, supabase });
    answer();

    const result = await getStaffBooking(7);

    expect(result.ok && result.data.canDecide).toBe(canDecide);
  });

  it("says the booking is not there when the read finds nothing", async () => {
    answer(null);

    const result = await getStaffBooking(7);

    expect(result).toEqual({
      ok: false,
      error: { kind: "not_found", message: "That online booking is not there." },
    });
  });
});

describe("getBookingIdByCode (AC-3)", () => {
  it("matches the exact stored code and answers its booking", async () => {
    queue("booking", { data: { id: 7 }, error: null });

    const result = await getBookingIdByCode("K7MQ3XPT");

    expect(result).toEqual({ ok: true, data: { bookingId: 7 } });
    expect(calls).toContainEqual({ table: "booking", method: "eq", args: ["code", "K7MQ3XPT"] });
  });

  it("answers an unknown code with the no match line", async () => {
    queue("booking", { data: null, error: null });

    const result = await getBookingIdByCode("K7MQ3XPT");

    expect(result).toEqual({
      ok: false,
      error: { kind: "not_found", message: "No online booking with that code." },
    });
  });
});

describe("getProofPath (AC-17)", () => {
  it("answers the stored path, or none once the purge cleared it", async () => {
    queue("booking", { data: { proof_path: "7/proof.webp" }, error: null });
    queue("booking", { data: { proof_path: null }, error: null });

    expect(await getProofPath(supabase as never, 7)).toEqual({ ok: true, path: "7/proof.webp" });
    expect(await getProofPath(supabase as never, 7)).toEqual({ ok: true, path: null });
  });
});
