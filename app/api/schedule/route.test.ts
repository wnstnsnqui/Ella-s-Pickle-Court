import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0006, AC-2, AC-5 and AC-7: the public re read is a GET that answers the
 * `ActionResult` shape, 422 for a bad or out of range date, never cached, and
 * its body carries nothing personal at any depth.
 */

const getSchedule = vi.hoisted(() => vi.fn());
vi.mock("@/lib/schedule/queries", () => ({ getSchedule }));

const { GET } = await import("./route");

const request = (query = "") =>
  ({ nextUrl: new URL(`http://localhost/api/schedule${query}`) }) as never;

const schedule = {
  grid: {
    date: "2026-09-16",
    timezone: "Asia/Manila",
    openTime: "06:00",
    closeTime: "22:00",
    slotMinutes: 60,
    courts: [{ id: 1, name: "Court 1", note: null, sortOrder: 1 }],
    rows: [
      {
        startsAt: "2026-09-15T22:00:00.000Z",
        endsAt: "2026-09-15T23:00:00.000Z",
        label: "06:00",
        outOfHours: false,
        cells: [{ courtId: 1, state: "booked", blocks: [7] }],
      },
    ],
  },
  settingsVersion: 1,
  horizonDays: 14,
  now: "2026-09-15T22:30:00.000Z",
  hours: {
    weekdayOpen: "06:00",
    weekdayClose: "22:00",
    weekendOpen: "06:00",
    weekendClose: "23:00",
  },
};

const PERSONAL = [
  "customer_name",
  "customerName",
  "customer_phone",
  "customerPhone",
  "payment_status",
  "paymentStatus",
  "amount",
];

function keysAtAnyDepth(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => keysAtAnyDepth(item, into));
  else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      into.add(key);
      keysAtAnyDepth(inner, into);
    }
  }
  return into;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/schedule", () => {
  it("returns the schedule as an ActionResult, uncached, for today when no date is given (AC-5)", async () => {
    getSchedule.mockResolvedValue({ ok: true, data: schedule });
    const response = await GET(request());
    expect(getSchedule).toHaveBeenCalledWith(undefined);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, data: schedule });
  });

  it("passes a well formed date through (AC-2)", async () => {
    getSchedule.mockResolvedValue({ ok: true, data: schedule });
    await GET(request("?date=2026-09-16"));
    expect(getSchedule).toHaveBeenCalledWith("2026-09-16");
  });

  it("answers 422 for a malformed date without reading (AC-2)", async () => {
    const response = await GET(request("?date=2026-13-40"));
    expect(getSchedule).not.toHaveBeenCalled();
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, error: { kind: "invalid" } });
  });

  it("answers 422 when the read refuses the day (a past or far date) (AC-2)", async () => {
    getSchedule.mockResolvedValue({
      ok: false,
      error: { kind: "invalid", message: "That day has passed.", issues: { date: [] } },
    });
    const response = await GET(request("?date=2026-09-01"));
    expect(response.status).toBe(422);
  });

  it("answers 500 when the read fails", async () => {
    getSchedule.mockResolvedValue({ ok: false, error: { kind: "failed", message: "down" } });
    const response = await GET(request());
    expect(response.status).toBe(500);
  });

  it("carries no personal key at any depth (AC-7)", async () => {
    getSchedule.mockResolvedValue({ ok: true, data: schedule });
    const body = await (await GET(request())).json();
    const keys = keysAtAnyDepth(body);
    for (const key of PERSONAL) expect(keys.has(key)).toBe(false);
    // A reservation level `note` never appears either: the grid has no reservations at all.
    expect(keys.has("reservations")).toBe(false);
  });
});
