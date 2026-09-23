import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0009: `captureStaffEvent()` and `reportFailure()` are fire and forget,
 * gated entirely on `NEXT_PUBLIC_POSTHOG_KEY` (AC-9), and `captureStaffEvent()`
 * never sends a property bag that fails the allow list (AC-5).
 */

const capture = vi.hoisted(() => vi.fn());
const captureException = vi.hoisted(() => vi.fn());
// A real function, not an arrow, so `new PostHog(...)` in the source under
// test can actually construct it.
const PostHog = vi.hoisted(() =>
  vi.fn().mockImplementation(function PostHogMock(this: unknown) {
    Object.assign(this as object, { capture, captureException });
  }),
);
vi.mock("posthog-node", () => ({ PostHog }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
});

describe("off switch (AC-9)", () => {
  it("never constructs a PostHog client with no key set", async () => {
    const { captureStaffEvent, reportFailure, analyticsServer } = await import("./server");
    captureStaffEvent("user_1", "hours_changed", {
      days_open: 7,
      days_closed: 0,
      earliest_open: "06:00",
      latest_close: "22:00",
      slot_minutes: 60,
      booking_horizon_days: 14,
    });
    reportFailure({ code: "XX000", message: "disk on fire" }, { action: "test" });
    expect(analyticsServer()).toBeNull();
    expect(PostHog).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe("captureStaffEvent (AC-4, AC-5)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
  });

  it("sends a valid property bag through to posthog-node", async () => {
    const { captureStaffEvent } = await import("./server");
    captureStaffEvent("user_1", "hours_changed", {
      days_open: 7,
      days_closed: 0,
      earliest_open: "06:00",
      latest_close: "22:00",
      slot_minutes: 60,
      booking_horizon_days: 14,
    });
    expect(capture).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ distinctId: "user_1", event: "hours_changed" }),
    );
  });

  it("drops an event whose properties fail the allow list, without sending anything", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { captureStaffEvent } = await import("./server");
    captureStaffEvent(
      "user_1",
      "hours_changed",
      // @ts-expect-error deliberately outside the allow list
      { days_open: 7, customer_phone: "+639170000000" },
    );
    expect(capture).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("reportFailure (AC-7)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
  });

  it("captures a scrubbed ActionFailed exception with the action and code", async () => {
    const { reportFailure } = await import("./server");
    reportFailure(
      { code: "XX000", message: "disk on fire", details: "row (x)=(y)", hint: "try again" },
      { action: "getSchedule", distinctId: "user_1" },
    );
    expect(captureException).toHaveBeenCalledTimes(1);
    const [error, distinctId, properties] = captureException.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("ActionFailed");
    expect((error as Error).message).toBe("getSchedule: XX000 disk on fire");
    expect((error as Error).message).not.toContain("row (x)=(y)");
    expect(distinctId).toBe("user_1");
    expect(properties).toEqual({ action: "getSchedule", code: "XX000" });
  });
});
