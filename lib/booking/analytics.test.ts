import { describe, expect, it } from "vitest";

import { parseEventProperties } from "@/lib/analytics/properties";

import { countSlots, heldEventProperties } from "./analytics";

/** Spec 0015, AC-24: the checkout's events carry counts that pass the allow list. */
describe("heldEventProperties", () => {
  it("counts the picks and the distinct courts", () => {
    const properties = heldEventProperties([{ courtId: 1 }, { courtId: 1 }, { courtId: 2 }], 3);
    expect(properties).toEqual({ slots: 3, courts: 2, days_ahead: 3 });
    expect(parseEventProperties("online_booking_held", properties).ok).toBe(true);
  });

  it("never reports a negative days ahead", () => {
    expect(heldEventProperties([{ courtId: 1 }], -1).days_ahead).toBe(0);
  });
});

describe("countSlots", () => {
  const run = (start: string, end: string) => ({ starts_at: start, ends_at: end });

  it("adds every run's length in slots", () => {
    expect(
      countSlots(
        [
          run("2026-10-01T09:00:00Z", "2026-10-01T11:00:00Z"),
          run("2026-10-01T09:00:00Z", "2026-10-01T10:00:00Z"),
        ],
        60,
      ),
    ).toBe(3);
  });

  it("counts half hour slots at a 30 minute slot length", () => {
    expect(countSlots([run("2026-10-01T09:00:00Z", "2026-10-01T10:30:00Z")], 30)).toBe(3);
  });

  it("reads Postgres offsets as well as Z", () => {
    expect(countSlots([run("2026-10-01 09:00:00+00", "2026-10-01 10:00:00+00")], 60)).toBe(1);
  });
});

describe("the checkout events' allow list", () => {
  it("accepts a submitted event and refuses a stray property", () => {
    expect(parseEventProperties("online_booking_submitted", { slots: 2, retaken: false }).ok).toBe(
      true,
    );
    expect(
      parseEventProperties("online_booking_submitted", {
        slots: 2,
        retaken: false,
        code: "K7MQ3XPT",
      } as never).ok,
    ).toBe(false);
  });

  it("names only the five refusal reasons", () => {
    expect(
      parseEventProperties("online_booking_refused", { stage: "hold", reason: "bot_check" }).ok,
    ).toBe(true);
    expect(
      parseEventProperties("online_booking_refused", {
        stage: "submit",
        reason: "not_found",
      } as never).ok,
    ).toBe(false);
  });
});
