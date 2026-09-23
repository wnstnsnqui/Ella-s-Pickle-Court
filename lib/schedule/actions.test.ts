import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0005 Server Actions: the batch insert (AC-4, AC-5, AC-6), the closure
 * end edit (AC-8), and the refetch the board calls (AC-10). Better Auth and Supabase
 * are the boundaries and are faked here; what is under test is the order every
 * action keeps (`requireStaff()`, then Zod, then the write), the shape of the
 * write it sends, and the typed answer it hands back.
 */

const auth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ currentSession: auth }));

/**
 * A chainable stand in for a supabase-js query. Every builder method returns
 * the builder; awaiting it yields the next queued answer for that table.
 */
type Call = { table: string; method: string; args: unknown[] };
const calls: Call[] = [];
const answers = new Map<string, unknown[]>();

function queue(table: string, ...values: unknown[]) {
  answers.set(table, [...(answers.get(table) ?? []), ...values]);
}

function builder(table: string) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "select",
    "insert",
    "update",
    "eq",
    "lt",
    "gt",
    "is",
    "order",
    "match",
    "maybeSingle",
    "single",
    "abortSignal",
    "neq",
  ];
  for (const method of methods) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ table, method, args });
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => void) => {
    const list = answers.get(table) ?? [];
    resolve(list.shift() ?? { data: null, error: null });
  };
  return chain;
}

const staffSupabase = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/staff", () => ({ staffSupabase }));

const getStaffSchedule = vi.hoisted(() => vi.fn());
vi.mock("./queries", () => ({ getStaffSchedule }));

/** `save_venue_hours` is the one write that goes through a function, not a table. */
const rpc = vi.hoisted(() => vi.fn());

const captureStaffEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/server", () => ({ captureStaffEvent, reportFailure: vi.fn() }));

const {
  createReservation,
  createReservations,
  refreshStaffSchedule,
  retireCourt,
  saveCourt,
  saveVenueSettings,
  updateReservation,
} = await import("./actions");

const SETTINGS = {
  data: { timezone: "Asia/Manila", booking_horizon_days: 14, version: 1 },
  error: null,
};

/** Today at the venue, so a run "tomorrow" is always inside the window. */
function tomorrow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).formatToParts(
    new Date(Date.now() + 86_400_000),
  );
  const read = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${read("year")}-${read("month")}-${read("day")}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  answers.clear();
  auth.mockResolvedValue({ user: { id: "user_staff" } });
  rpc.mockResolvedValue({ data: null, error: null });
  staffSupabase.mockReturnValue({ from: (table: string) => builder(table), rpc });
});

describe("createReservations", () => {
  it("refuses a signed out caller before touching the database", async () => {
    auth.mockResolvedValue(null);
    const result = await createReservations({ runs: [], kind: "closed" });
    expect(result).toMatchObject({ ok: false, error: { kind: "unauthenticated" } });
    expect(staffSupabase).not.toHaveBeenCalled();
  });

  it("refuses a payload the schema rejects, naming the field (AC-4)", async () => {
    const result = await createReservations({
      runs: [{ courtId: 1, date: tomorrow(), startTime: "16:00", endTime: "17:00" }],
      kind: "booking",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid");
    if (result.error.kind !== "invalid") return;
    expect(result.error.issues.customerName).toBeDefined();
    expect(calls).toHaveLength(0);
  });

  it("writes every run in one insert with the same customer fields and the caller as writer (AC-4)", async () => {
    queue("venue_settings", SETTINGS);
    queue("reservation", { data: [{ id: 1 }, { id: 2 }], error: null });
    const date = tomorrow();

    const result = await createReservations({
      runs: [
        { courtId: 1, date, startTime: "16:00", endTime: "18:00" },
        { courtId: 2, date, startTime: "16:00", endTime: "17:00" },
      ],
      kind: "booking",
      customerName: "Maria",
      customerPhone: "+63 917 123 4567",
      paymentStatus: "paid",
      amount: 250.5,
    });

    expect(result).toEqual({ ok: true, data: [{ id: 1 }, { id: 2 }] });
    const inserts = calls.filter((call) => call.method === "insert");
    expect(inserts).toHaveLength(1);
    const rows = inserts[0].args[0] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    // 4pm Manila is 08:00Z, the venue's timezone from the settings row.
    expect(rows[0]).toMatchObject({
      court_id: 1,
      kind: "booking",
      starts_at: `${date}T08:00:00.000Z`,
      ends_at: `${date}T10:00:00.000Z`,
      customer_name: "Maria",
      customer_phone: "+63 917 123 4567",
      payment_status: "paid",
      amount: 250.5,
      created_by: "user_staff",
      changed_by: "user_staff",
    });
    expect(rows[1]).toMatchObject({ court_id: 2, customer_name: "Maria", amount: 250.5 });
  });

  it("defaults a closure to unpaid with no customer, and never loops single inserts (AC-5)", async () => {
    queue("venue_settings", SETTINGS);
    queue("reservation", { data: [{ id: 3 }], error: null });
    const date = tomorrow();

    await createReservations({
      runs: [
        { courtId: 1, date, startTime: "09:00", endTime: "10:00" },
        { courtId: 1, date, startTime: "11:00", endTime: "12:00" },
      ],
      kind: "closed",
      note: "Net repair",
    });

    const inserts = calls.filter((call) => call.method === "insert");
    expect(inserts).toHaveLength(1);
    const rows = inserts[0].args[0] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: "closed",
      customer_name: null,
      payment_status: "unpaid",
      note: "Net repair",
    });
  });

  it("turns the exclusion constraint refusing the set into a slot_taken conflict (AC-6)", async () => {
    queue("venue_settings", SETTINGS);
    queue("reservation", {
      data: null,
      error: {
        code: "23P01",
        message: 'conflicting key value violates exclusion constraint "reservation_no_overlap"',
      },
    });

    const result = await createReservations({
      runs: [{ courtId: 1, date: tomorrow(), startTime: "16:00", endTime: "17:00" }],
      kind: "booking",
      customerName: "Maria",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "conflict", reason: "slot_taken" },
    });
    if (result.ok) return;
    expect(result.error.message).not.toMatch(/exclusion|23P01/);
  });

  it("surfaces a policy refusal as forbidden, the answer a staff member gets on an ended slot (AC-11)", async () => {
    queue("venue_settings", SETTINGS);
    queue("reservation", {
      data: null,
      error: { code: "42501", message: "new row violates row-level security policy" },
    });

    const result = await createReservations({
      runs: [{ courtId: 1, date: tomorrow(), startTime: "16:00", endTime: "17:00" }],
      kind: "closed",
    });

    expect(result).toMatchObject({ ok: false, error: { kind: "forbidden" } });
  });

  it("refuses a run past the booking horizon before writing (AC-14)", async () => {
    queue("venue_settings", SETTINGS);
    const farAway = "2030-01-01";

    const result = await createReservations({
      runs: [{ courtId: 1, date: farAway, startTime: "16:00", endTime: "17:00" }],
      kind: "closed",
    });

    expect(result).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(calls.filter((call) => call.method === "insert")).toHaveLength(0);
  });
});

describe("updateReservation with endTime alone (closure edit, AC-8)", () => {
  it("rebuilds ends_at from the stored row's own venue day", async () => {
    queue("venue_settings", SETTINGS);
    // The stored start: 6pm Manila on 2026-09-15 is 10:00Z.
    queue("reservation", { data: { starts_at: "2026-09-15T10:00:00.000Z" }, error: null });
    queue("reservation", { data: { id: 7, version: 3 }, error: null });

    const result = await updateReservation({ id: 7, version: 2, endTime: "21:00", note: "Longer" });

    expect(result).toEqual({ ok: true, data: { id: 7, version: 3 } });
    const update = calls.find((call) => call.method === "update");
    expect(update?.args[0]).toMatchObject({
      ends_at: "2026-09-15T13:00:00.000Z",
      note: "Longer",
      version: 3,
      changed_by: "user_staff",
    });
    expect(update?.args[0]).not.toHaveProperty("starts_at");
    // Conditional on the version the caller last read.
    expect(
      calls.some(
        (call) => call.method === "eq" && call.args[0] === "version" && call.args[1] === 2,
      ),
    ).toBe(true);
  });

  it("refuses an end that is not after the stored start", async () => {
    queue("venue_settings", SETTINGS);
    queue("reservation", { data: { starts_at: "2026-09-15T10:00:00.000Z" }, error: null });

    const result = await updateReservation({ id: 7, version: 2, endTime: "17:00" });

    expect(result).toMatchObject({ ok: false, error: { kind: "invalid" } });
    if (result.ok || result.error.kind !== "invalid") return;
    expect(result.error.issues.endTime).toBeDefined();
    expect(calls.filter((call) => call.method === "update")).toHaveLength(0);
  });

  it("answers version_stale when the row moved under the editor", async () => {
    queue("venue_settings", SETTINGS);
    queue("reservation", { data: { starts_at: "2026-09-15T10:00:00.000Z" }, error: null });
    queue("reservation", { data: null, error: null }); // zero rows updated
    queue("reservation", { data: { version: 4 }, error: null }); // the explain refetch

    const result = await updateReservation({ id: 7, version: 2, endTime: "21:00" });

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "conflict", reason: "version_stale" },
    });
  });
});

describe("refreshStaffSchedule", () => {
  it("validates the date, then hands the read to getStaffSchedule (AC-10)", async () => {
    getStaffSchedule.mockResolvedValue({ ok: true, data: { marker: "day" } });

    const result = await refreshStaffSchedule({ date: "2026-09-15" });

    expect(getStaffSchedule).toHaveBeenCalledWith("2026-09-15");
    expect(result).toEqual({ ok: true, data: { marker: "day" } });
  });

  it("refuses a malformed date without reading anything", async () => {
    const result = await refreshStaffSchedule({ date: "next tuesday" });

    expect(result).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(getStaffSchedule).not.toHaveBeenCalled();
  });
});

/**
 * Spec 0009, AC-4: one analytics event after a successful write, none after a
 * refused one. `fireReservationEvent()` reads the court's name in a
 * background task, so these await `vi.waitFor()` rather than the action's own
 * promise to observe it.
 */
describe("analytics events (spec 0009, AC-4)", () => {
  it("fires one booking_created per row after createReservations succeeds", async () => {
    queue("venue_settings", SETTINGS);
    queue("reservation", {
      data: [
        {
          id: 1,
          court_id: 1,
          kind: "booking",
          starts_at: "2026-09-16T08:00:00.000Z",
          ends_at: "2026-09-16T09:00:00.000Z",
        },
        {
          id: 2,
          court_id: 2,
          kind: "booking",
          starts_at: "2026-09-16T08:00:00.000Z",
          ends_at: "2026-09-16T09:00:00.000Z",
        },
      ],
      error: null,
    });
    queue("court", { data: { name: "Court 1" }, error: null });
    queue("court", { data: { name: "Court 2" }, error: null });
    const date = tomorrow();

    await createReservations({
      runs: [
        { courtId: 1, date, startTime: "16:00", endTime: "17:00" },
        { courtId: 2, date, startTime: "16:00", endTime: "17:00" },
      ],
      kind: "booking",
      customerName: "Maria",
    });

    await vi.waitFor(() => expect(captureStaffEvent).toHaveBeenCalledTimes(2));
    expect(captureStaffEvent).toHaveBeenNthCalledWith(
      1,
      "user_staff",
      "booking_created",
      expect.objectContaining({
        reservation_id: 1,
        court_id: 1,
        court_name: "Court 1",
        action: "created",
      }),
    );
  });

  it("fires no event when createReservations is refused", async () => {
    queue("venue_settings", SETTINGS);
    queue("reservation", {
      data: null,
      error: { code: "23P01", message: 'exclusion constraint "reservation_no_overlap"' },
    });
    const date = tomorrow();

    await createReservations({
      runs: [{ courtId: 1, date, startTime: "16:00", endTime: "17:00" }],
      kind: "booking",
      customerName: "Maria",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(captureStaffEvent).not.toHaveBeenCalled();
  });

  it("fires booking_created with lead_time_hours for a single createReservation", async () => {
    queue("venue_settings", SETTINGS);
    queue("reservation", {
      data: {
        id: 5,
        court_id: 1,
        kind: "booking",
        starts_at: "2026-09-16T08:00:00.000Z",
        ends_at: "2026-09-16T09:00:00.000Z",
      },
      error: null,
    });
    queue("court", { data: { name: "Court 1" }, error: null });
    const date = tomorrow();

    await createReservation({
      courtId: 1,
      date,
      startTime: "16:00",
      endTime: "17:00",
      kind: "booking",
      customerName: "Maria",
    });

    await vi.waitFor(() => expect(captureStaffEvent).toHaveBeenCalledTimes(1));
    expect(captureStaffEvent.mock.calls[0][2]).toHaveProperty("lead_time_hours");
  });

  it("fires court_changed with action created after saveCourt inserts a new court", async () => {
    // sortOrder is given, so the "highest live order" read never runs and this
    // one queued answer is the insert's own `.select().single()`.
    queue("court", { data: { id: 9, name: "Court 9", note: null }, error: null });

    await saveCourt({ name: "Court 9", sortOrder: 0 });

    expect(captureStaffEvent).toHaveBeenCalledWith("user_staff", "court_changed", {
      court_id: 9,
      court_name: "Court 9",
      action: "created",
    });
  });

  it("fires no event when saveCourt is refused", async () => {
    queue("court", {
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    await saveCourt({ name: "Court 9" });

    expect(captureStaffEvent).not.toHaveBeenCalled();
  });

  it("fires court_changed with action retired after retireCourt succeeds", async () => {
    queue("reservation", { count: 0, error: null });
    queue("court", { data: { id: 3, name: "Court 3" }, error: null });

    await retireCourt({ id: 3, version: 1 });

    expect(captureStaffEvent).toHaveBeenCalledWith("user_staff", "court_changed", {
      court_id: 3,
      court_name: "Court 3",
      action: "retired",
    });
  });

  it("fires hours_changed after saveVenueSettings succeeds", async () => {
    queue("venue_settings", {
      data: { slot_minutes: 60, booking_horizon_days: 14, version: 2 },
      error: null,
    });

    await saveVenueSettings({
      days: [
        { dayOfWeek: 0, open: "06:00", close: "22:00" },
        { dayOfWeek: 1, open: "06:00", close: "22:00" },
        { dayOfWeek: 2, open: "06:00", close: "22:00" },
        { dayOfWeek: 3, open: "06:00", close: "22:00" },
        { dayOfWeek: 4, open: "06:00", close: "22:00" },
        { dayOfWeek: 5, open: "06:00", close: "22:00" },
        { dayOfWeek: 6, open: "06:00", close: "22:00" },
      ],
      slotMinutes: 60,
      bookingHorizonDays: 14,
      version: 1,
      acknowledge: true,
    });

    // The week as a shape, not twenty one values (spec 0007, AC-24).
    expect(captureStaffEvent).toHaveBeenCalledWith(
      "user_staff",
      "hours_changed",
      expect.objectContaining({
        days_open: 7,
        days_closed: 0,
        earliest_open: "06:00",
        latest_close: "22:00",
      }),
    );
  });

  it("writes the whole week, the slot length and the horizon in one call", async () => {
    queue("venue_settings", {
      data: { slot_minutes: 30, booking_horizon_days: 21, version: 2 },
      error: null,
    });

    await saveVenueSettings({
      days: [
        { dayOfWeek: 0, open: null, close: null },
        { dayOfWeek: 1, open: "06:00", close: "22:00" },
        { dayOfWeek: 2, open: "06:00", close: "22:00" },
        { dayOfWeek: 3, open: "06:00", close: "22:00" },
        { dayOfWeek: 4, open: "06:00", close: "22:00" },
        { dayOfWeek: 5, open: "06:00", close: "24:00" },
        { dayOfWeek: 6, open: "06:00", close: "22:00" },
      ],
      slotMinutes: 30,
      bookingHorizonDays: 21,
      version: 1,
      acknowledge: true,
    });

    expect(rpc).toHaveBeenCalledWith("save_venue_hours", {
      days: [
        { day_of_week: 0, open_time: null, close_time: null },
        { day_of_week: 1, open_time: "06:00", close_time: "22:00" },
        { day_of_week: 2, open_time: "06:00", close_time: "22:00" },
        { day_of_week: 3, open_time: "06:00", close_time: "22:00" },
        { day_of_week: 4, open_time: "06:00", close_time: "22:00" },
        { day_of_week: 5, open_time: "06:00", close_time: "24:00" },
        { day_of_week: 6, open_time: "06:00", close_time: "22:00" },
      ],
      settings_version: 1,
      slot_minutes: 30,
      booking_horizon_days: 21,
    });
    // A closed Sunday has no earliest or latest of its own to report.
    expect(captureStaffEvent).toHaveBeenCalledWith(
      "user_staff",
      "hours_changed",
      expect.objectContaining({ days_open: 6, days_closed: 1, latest_close: "24:00" }),
    );
  });
});
