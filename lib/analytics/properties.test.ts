import { describe, expect, it } from "vitest";

import { parseEventProperties, scrubError } from "./properties";

/**
 * Spec 0009, AC-5: enforcement is an allow list, not a deny list. A property
 * bag naming a customer's name, phone, note or amount must be refused for
 * every event that could plausibly carry one, and `scrubError()` must strip
 * `details` and `hint` from a Postgres error.
 */

const VALID_RESERVATION_EVENT = {
  reservation_id: 1,
  court_id: 2,
  court_name: "Court 1",
  kind: "booking" as const,
  action: "created" as const,
  starts_at: "2026-09-15T00:00:00.000Z",
  ends_at: "2026-09-15T01:00:00.000Z",
  duration_minutes: 60,
};

describe("parseEventProperties", () => {
  it("accepts a property bag that matches the schema exactly", () => {
    const result = parseEventProperties("booking_created", VALID_RESERVATION_EVENT);
    expect(result.ok).toBe(true);
  });

  it.each(["customer_name", "customer_phone", "note", "amount"])(
    "refuses a booking_created bag carrying %s",
    (forbiddenKey) => {
      const result = parseEventProperties("booking_created", {
        ...VALID_RESERVATION_EVENT,
        [forbiddenKey]: "leak",
      } as never);
      expect(result.ok).toBe(false);
    },
  );

  it.each(["customer_name", "customer_phone", "note", "amount"])(
    "refuses a closure_created bag carrying %s",
    (forbiddenKey) => {
      const result = parseEventProperties("closure_created", {
        ...VALID_RESERVATION_EVENT,
        kind: "closure",
        [forbiddenKey]: "leak",
      } as never);
      expect(result.ok).toBe(false);
    },
  );

  it("refuses a court_changed bag carrying an unlisted property", () => {
    const result = parseEventProperties("court_changed", {
      court_id: 1,
      court_name: "Court 1",
      action: "created",
      note: "leak",
    } as never);
    expect(result.ok).toBe(false);
  });

  it("refuses an hours_changed bag carrying an unlisted property", () => {
    const result = parseEventProperties("hours_changed", {
      weekday_open: "06:00",
      weekday_close: "22:00",
      weekend_open: "06:00",
      weekend_close: "22:00",
      slot_minutes: 60,
      booking_horizon_days: 14,
      amount: 500,
    } as never);
    expect(result.ok).toBe(false);
  });

  it("refuses a board_day_viewed bag carrying anything beyond day_offset", () => {
    const result = parseEventProperties("board_day_viewed", {
      day_offset: 0,
      customer_name: "leak",
    } as never);
    expect(result.ok).toBe(false);
  });

  it("accepts a staff_session_refused bag carrying only the PostgREST code", () => {
    expect(parseEventProperties("staff_session_refused", { code: "PGRST303" }).ok).toBe(true);
  });

  it("refuses a staff_session_refused bag carrying anything beyond the code", () => {
    const result = parseEventProperties("staff_session_refused", {
      code: "PGRST303",
      customer_name: "leak",
    } as never);
    expect(result.ok).toBe(false);
  });
});

describe("scrubError", () => {
  it("keeps only code and message, dropping details and hint", () => {
    const scrubbed = scrubError({
      code: "23505",
      message: "duplicate key value violates unique constraint",
      details: "Key (customer_phone)=(+639170000000) already exists.",
      hint: "Try a different phone number.",
    });
    expect(scrubbed).toEqual({
      code: "23505",
      message: "duplicate key value violates unique constraint",
    });
  });

  it("handles an error with no code", () => {
    expect(scrubError({ message: "disk on fire" })).toEqual({
      code: undefined,
      message: "disk on fire",
    });
  });
});
