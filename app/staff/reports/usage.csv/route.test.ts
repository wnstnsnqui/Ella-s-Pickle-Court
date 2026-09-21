import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0008, AC-9: a signed out caller gets 401, a signed in non owner gets
 * 403, and `court_usage`'s own `insufficient_privilege` (surfaced by
 * `getUsageReport` as a `forbidden` result) is also mapped to 403. Better Auth and
 * the report read are the boundaries here and are faked.
 */

const auth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ currentSession: auth }));

const currentStaff = vi.hoisted(() => vi.fn());
vi.mock("@/lib/staff", () => ({ currentStaff }));

const getUsageReport = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report/queries", () => ({ getUsageReport }));

const { GET } = await import("./route");

function requestFor(query: Record<string, string> = {}) {
  const searchParams = new URLSearchParams(query);
  return { nextUrl: { searchParams } } as never;
}

const OWNER = {
  kind: "ok" as const,
  staff: {
    displayName: "Ella",
    role: "owner" as const,
    isActive: true,
    privacyAcknowledgedVersion: null,
  },
};
const STAFF = {
  kind: "ok" as const,
  staff: {
    displayName: "Sean",
    role: "staff" as const,
    isActive: true,
    privacyAcknowledgedVersion: null,
  },
};

const REPORT = {
  ok: true as const,
  data: {
    from: "2026-08-18",
    to: "2026-09-17",
    rows: [{ courtId: 1, localDate: "2026-09-17", hour: 9, bookedMinutes: 60 }],
    courts: [{ id: 1, name: "Court 1", sortOrder: 0, retiredAt: null }],
    hours: {
      weekdayOpen: "08:00",
      weekdayClose: "22:00",
      weekendOpen: "06:00",
      weekendClose: "24:00",
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "user_1" } });
  currentStaff.mockResolvedValue(OWNER);
  getUsageReport.mockResolvedValue(REPORT);
});

describe("GET /staff/reports/usage.csv", () => {
  it("answers 401 for a signed out caller, before reading current staff or the report", async () => {
    auth.mockResolvedValue(null);
    const response = await GET(requestFor());
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Sign in to download this report.");
    expect(currentStaff).not.toHaveBeenCalled();
    expect(getUsageReport).not.toHaveBeenCalled();
  });

  it("answers 403 for a signed in staff account that is not an owner", async () => {
    currentStaff.mockResolvedValue(STAFF);
    const response = await GET(requestFor());
    expect(response.status).toBe(403);
    expect(getUsageReport).not.toHaveBeenCalled();
  });

  it("answers 403 for an owner account that is switched off", async () => {
    currentStaff.mockResolvedValue({ kind: "ok", staff: { ...OWNER.staff, isActive: false } });
    const response = await GET(requestFor());
    expect(response.status).toBe(403);
  });

  it("answers 403 when currentStaff could not be read", async () => {
    currentStaff.mockResolvedValue({ kind: "error" });
    const response = await GET(requestFor());
    expect(response.status).toBe(403);
  });

  it("streams the CSV with the right headers for an active owner", async () => {
    const response = await GET(requestFor({ range: "last-30-days", court: "1" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="usage-2026-08-18-2026-09-17.csv"',
    );
    const body = await response.text();
    expect(body).toContain("court,date,weekday,hour,booked_minutes");
    expect(body).toContain("Court 1,2026-09-17,Thu,9,60");
    expect(getUsageReport).toHaveBeenCalledWith({ range: "last-30-days", courtId: 1 });
  });

  it("defaults the range and leaves the court unset when neither is given", async () => {
    await GET(requestFor());
    expect(getUsageReport).toHaveBeenCalledWith({ range: "last-30-days", courtId: undefined });
  });

  it("maps a forbidden report read to 403", async () => {
    getUsageReport.mockResolvedValue({
      ok: false,
      error: { kind: "forbidden", message: "Your account is not allowed to read this report." },
    });
    const response = await GET(requestFor());
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Your account is not allowed to read this report.");
  });

  it("maps any other report failure to 503", async () => {
    getUsageReport.mockResolvedValue({
      ok: false,
      error: { kind: "failed", message: "The venue database did not answer in time." },
    });
    const response = await GET(requestFor());
    expect(response.status).toBe(503);
  });
});
