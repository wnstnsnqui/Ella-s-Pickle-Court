import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0013, AC-14 and AC-23: "Request booking" sends one `booking_intent`
 * carrying only the three counts, through the allow list, and a browser read
 * that runs out of retries reports one exception. Both do nothing at all when
 * PostHog is unconfigured. `posthog-js` is the boundary, so it is stood in for.
 */

const posthog = vi.hoisted(() => ({
  capture: vi.fn(),
  captureException: vi.fn(),
}));
const env = vi.hoisted(() => ({ configured: true }));

vi.mock("posthog-js", () => ({ default: posthog }));
vi.mock("@/lib/env", () => ({
  get posthogConfigured() {
    return env.configured;
  },
}));

const { captureBookingIntent, captureBrowserException } = await import("./browser");

beforeEach(() => {
  vi.clearAllMocks();
  env.configured = true;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("captureBookingIntent (AC-14)", () => {
  it("sends one booking_intent with exactly the three counts", () => {
    captureBookingIntent({ slots: 3, courts: 2, days_ahead: 2 });
    expect(posthog.capture).toHaveBeenCalledTimes(1);
    expect(posthog.capture).toHaveBeenCalledWith("booking_intent", {
      slots: 3,
      courts: 2,
      days_ahead: 2,
    });
  });

  it("drops a bag carrying anything more, and says so in the console", () => {
    captureBookingIntent({
      slots: 1,
      courts: 1,
      days_ahead: 0,
      date: "2026-09-26",
    } as unknown as Parameters<typeof captureBookingIntent>[0]);
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(vi.mocked(console.warn).mock.calls[0][0]).toMatch(/dropped "booking_intent"/);
  });

  it("does nothing when PostHog is unconfigured", () => {
    env.configured = false;
    captureBookingIntent({ slots: 3, courts: 2, days_ahead: 2 });
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe("captureBrowserException (AC-23)", () => {
  it("reports the error it is given, once", () => {
    const error = new Error("landing: schedule read failed after retries");
    captureBrowserException(error);
    expect(posthog.captureException).toHaveBeenCalledTimes(1);
    expect(posthog.captureException).toHaveBeenCalledWith(error);
  });

  it("does nothing when PostHog is unconfigured", () => {
    env.configured = false;
    captureBrowserException(new Error("ignored"));
    expect(posthog.captureException).not.toHaveBeenCalled();
  });
});
