import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0017, AC-2, AC-8 to AC-10, AC-13, AC-18 and AC-20: what `lookupBooking`
 * hands the page for every answer the database can give, and the one event
 * each sends. The token mint, Supabase and analytics are the boundaries and
 * are faked here; the rules themselves are proven against Postgres in
 * `supabase/tests/booking_lookup.test.ts`.
 */

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/rate-limit", () => ({ clientAddress: () => "203.0.113.7" }));
vi.mock("./client-hash", () => ({ hashClient: () => "client-hash" }));

const mint = vi.hoisted(() => vi.fn(() => "minted-token"));
vi.mock("@/lib/supabase/staff-token", () => ({
  mintBookingLookupToken: mint,
  mintOnlineBookingToken: vi.fn(),
}));

const answer = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn(() => ({ abortSignal: answer })));
const createClient = vi.hoisted(() => vi.fn(() => ({ rpc })));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

vi.mock("@/lib/env", () => ({
  publicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  }),
  VENUE_TIMEZONE: "Asia/Manila",
}));

vi.mock("@/lib/supabase/public", () => ({ publicSupabase: vi.fn() }));

const capturePublicEvent = vi.hoisted(() => vi.fn());
const reportFailure = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/server", () => ({ capturePublicEvent, reportFailure }));

const { lookupBooking } = await import("./actions");

const FOUND = {
  ok: true,
  view: "cancelled",
  code: "K7MQ3XPT",
  reason: "no_payment",
  refund_status: "refunded",
  refund_amount: "500.00",
  refunded_at: "2026-10-31T02:00:00+00:00",
  first_name: "Ana",
  phone_last4: "4567",
  email_masked: "a•••@example.com",
  amount: "500.00",
  submitted_at: "2026-10-01T01:03:00+00:00",
  runs: [
    {
      court_id: 1,
      court_name: "Court 1",
      starts_at: "2026-10-12T09:00:00+00:00",
      ends_at: "2026-10-12T11:00:00+00:00",
      amount: "500.00",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  answer.mockResolvedValue({ data: FOUND, error: null });
});

describe("lookupBooking", () => {
  it("takes the code in any typed form and asks for it as stored (AC-2)", async () => {
    await lookupBooking({ code: " k7mq-3xpt " });
    expect(rpc).toHaveBeenCalledWith("lookup_online_booking", { p_code: "K7MQ3XPT" });
    expect(mint).toHaveBeenCalledWith("client-hash");
  });

  it("refuses a code that cannot be one without minting or asking the database (AC-2)", async () => {
    for (const code of ["K7MQ3XP", "K7MQ3XPT9", "K7MQ3XP0", "IIIIIIII", 42]) {
      const result = await lookupBooking({ code });
      expect(result).toEqual({
        ok: false,
        error: {
          kind: "invalid",
          message: "A booking code is 8 letters and numbers, like K7MQ-3XPT.",
        },
      });
    }
    expect(mint).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(capturePublicEvent).not.toHaveBeenCalled();
  });

  it("hands the page the masked booking and sends found with its view (AC-6, AC-20)", async () => {
    const result = await lookupBooking({ code: "K7MQ3XPT" });
    expect(result).toEqual({
      ok: true,
      data: {
        view: "cancelled",
        code: "K7MQ3XPT",
        reason: "no_payment",
        refund: { status: "refunded", amount: 500, refundedAt: "2026-10-31T02:00:00+00:00" },
        customer: { firstName: "Ana", phoneLast4: "4567", emailMasked: "a•••@example.com" },
        amount: 500,
        submittedAt: "2026-10-01T01:03:00+00:00",
        runs: [
          {
            courtId: 1,
            courtName: "Court 1",
            startsAt: "2026-10-12T09:00:00+00:00",
            endsAt: "2026-10-12T11:00:00+00:00",
            amount: 500,
          },
        ],
      },
    });
    expect(capturePublicEvent).toHaveBeenCalledExactlyOnceWith("booking_lookup", {
      result: "found",
      view: "cancelled",
    });
  });

  it("owes the booking's amount when the refund is still owed (AC-6)", async () => {
    answer.mockResolvedValue({
      data: { ...FOUND, refund_status: "owed", refund_amount: null, refunded_at: null },
      error: null,
    });
    const result = await lookupBooking({ code: "K7MQ3XPT" });
    expect(result.ok && result.data.refund).toEqual({ status: "owed", amount: 500 });
  });

  it("answers not found in the spec's words, sending only the result (AC-8, AC-20)", async () => {
    answer.mockResolvedValue({ data: { ok: false, reason: "not_found" }, error: null });
    expect(await lookupBooking({ code: "K7MQ3XPT" })).toEqual({
      ok: false,
      error: {
        kind: "not_found",
        message:
          "We couldn't find a booking with that code. Check it against your receipt, or message us.",
      },
    });
    expect(capturePublicEvent).toHaveBeenCalledExactlyOnceWith("booking_lookup", {
      result: "not_found",
    });
  });

  it("names the day the booking ended from its last run's start (AC-9)", async () => {
    answer.mockResolvedValue({
      data: { ok: false, reason: "ended", ended_at: "2026-10-31T15:00:00+00:00" },
      error: null,
    });
    const result = await lookupBooking({ code: "K7MQ3XPT" });
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "ended",
        // 15:00 UTC is 11pm on Sat 31 Oct in Manila.
        message: "This booking ended on Sat 31 Oct. Message us if you need its receipt.",
        endedAt: "2026-10-31T15:00:00+00:00",
      },
    });
    expect(capturePublicEvent).toHaveBeenCalledWith("booking_lookup", { result: "ended" });
  });

  it("says how many whole minutes to wait when limited (AC-10)", async () => {
    answer.mockResolvedValue({
      data: { ok: false, reason: "rate_limited", retry_after_seconds: 61 },
      error: null,
    });
    expect(await lookupBooking({ code: "K7MQ3XPT" })).toEqual({
      ok: false,
      error: {
        kind: "rate_limited",
        message:
          "Too many wrong codes from this connection. Try again in 2 minutes, or message us.",
        retryAfterSeconds: 61,
      },
    });
    expect(capturePublicEvent).toHaveBeenCalledWith("booking_lookup", { result: "rate_limited" });
  });

  it("reports a database error and answers failed, sending no event (AC-13)", async () => {
    answer.mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" } });
    expect(await lookupBooking({ code: "K7MQ3XPT" })).toEqual({
      ok: false,
      error: { kind: "failed", message: "We couldn't check your booking just now." },
    });
    expect(reportFailure).toHaveBeenCalledOnce();
    expect(capturePublicEvent).not.toHaveBeenCalled();
  });

  it("treats an answer carrying a key the spec does not allow as a failure (AC-18)", async () => {
    answer.mockResolvedValue({
      data: { ...FOUND, customer_phone: "+639171234567" },
      error: null,
    });
    const result = await lookupBooking({ code: "K7MQ3XPT" });
    expect(result).toEqual({
      ok: false,
      error: { kind: "failed", message: "We couldn't check your booking just now." },
    });
    expect(reportFailure).toHaveBeenCalledOnce();
  });

  it("sends the view with found for each status the page can show (AC-20)", async () => {
    for (const view of ["confirmed", "cancelled", "not_booked"] as const) {
      capturePublicEvent.mockClear();
      answer.mockResolvedValue({ data: { ...FOUND, view }, error: null });
      await lookupBooking({ code: "K7MQ3XPT" });
      expect(capturePublicEvent).toHaveBeenCalledExactlyOnceWith("booking_lookup", {
        result: "found",
        view,
      });
    }
  });

  it("falls back to the booking's amount when a refund is marked sent with no amount (AC-6)", async () => {
    answer.mockResolvedValue({ data: { ...FOUND, refund_amount: null }, error: null });
    const result = await lookupBooking({ code: "K7MQ3XPT" });
    expect(result.ok && result.data.refund).toEqual({
      status: "refunded",
      amount: 500,
      refundedAt: "2026-10-31T02:00:00+00:00",
    });
  });

  it("shows no refund line for a refund marked sent with no date, or not owed (AC-6)", async () => {
    for (const data of [
      { ...FOUND, refunded_at: null },
      { ...FOUND, refund_status: "not_owed", refund_amount: null, refunded_at: null },
      { ...FOUND, refund_status: null, refund_amount: null, refunded_at: null },
    ]) {
      answer.mockResolvedValue({ data, error: null });
      const result = await lookupBooking({ code: "K7MQ3XPT" });
      expect(result.ok && result.data.refund).toBeNull();
    }
  });

  it("waits the whole 15 minutes when the limit names no time (AC-10)", async () => {
    answer.mockResolvedValue({ data: { ok: false, reason: "rate_limited" }, error: null });
    const result = await lookupBooking({ code: "K7MQ3XPT" });
    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "rate_limited",
        message:
          "Too many wrong codes from this connection. Try again in 15 minutes, or message us.",
        retryAfterSeconds: 900,
      },
    });
  });

  it("treats ended with no date as a failure, not a blank date (AC-9, AC-13)", async () => {
    answer.mockResolvedValue({ data: { ok: false, reason: "ended" }, error: null });
    expect(await lookupBooking({ code: "K7MQ3XPT" })).toEqual({
      ok: false,
      error: { kind: "failed", message: "We couldn't check your booking just now." },
    });
    expect(reportFailure).toHaveBeenCalledOnce();
    expect(capturePublicEvent).not.toHaveBeenCalled();
  });

  it("treats an empty answer as a failure (AC-13)", async () => {
    answer.mockResolvedValue({ data: null, error: null });
    const result = await lookupBooking({ code: "K7MQ3XPT" });
    expect(result).toEqual({
      ok: false,
      error: { kind: "failed", message: "We couldn't check your booking just now." },
    });
    expect(reportFailure).toHaveBeenCalledOnce();
  });

  it("answers without waiting for the event to send (AC-20)", async () => {
    capturePublicEvent.mockReturnValue(new Promise(() => {}));
    const result = await lookupBooking({ code: "K7MQ3XPT" });
    expect(result.ok).toBe(true);
  });

  it("logs a refused code with a warning that never names it (AC-11, AC-20)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await lookupBooking({ code: "K7MQ3XP" });
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("K7MQ");
    expect(reportFailure).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("never puts the code in a report or an event (AC-11)", async () => {
    answer.mockResolvedValue({ data: null, error: { message: "boom" } });
    await lookupBooking({ code: "K7MQ3XPT" });
    answer.mockResolvedValue({ data: FOUND, error: null });
    await lookupBooking({ code: "K7MQ3XPT" });
    const sent = JSON.stringify([reportFailure.mock.calls, capturePublicEvent.mock.calls]);
    expect(sent).not.toContain("K7MQ");
  });
});
