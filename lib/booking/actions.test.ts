import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0015, AC-4 to AC-7, AC-12 to AC-15, AC-19, AC-20 and AC-24: what the
 * three checkout actions hand the sheet for every answer the database can
 * give, and which of them send an event. Turnstile, the token mint, Supabase
 * and analytics are the boundaries and are faked here; the rules themselves
 * are proven against Postgres in `supabase/tests/online_booking_*.test.ts`.
 */

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/rate-limit", () => ({ clientAddress: () => "203.0.113.7" }));
vi.mock("./client-hash", () => ({ hashClient: () => "client-hash" }));

const verifyTurnstile = vi.hoisted(() => vi.fn());
vi.mock("./turnstile", () => ({ verifyTurnstile }));

const mint = vi.hoisted(() => vi.fn(() => "minted-token"));
vi.mock("@/lib/supabase/staff-token", () => ({ mintOnlineBookingToken: mint }));

const rpc = vi.hoisted(() => vi.fn());
const createSignedUploadUrl = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() =>
  vi.fn(() => ({ rpc, storage: { from: () => ({ createSignedUploadUrl }) } })),
);
vi.mock("@supabase/supabase-js", () => ({ createClient }));

vi.mock("@/lib/env", () => ({
  publicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  }),
  VENUE_TIMEZONE: "Asia/Manila",
}));

const slotMinutes = vi.hoisted(() => vi.fn(async () => ({ data: { slot_minutes: 60 } })));
vi.mock("@/lib/supabase/public", () => ({
  publicSupabase: () => ({ from: () => ({ select: () => ({ maybeSingle: slotMinutes }) }) }),
}));

const capturePublicEvent = vi.hoisted(() => vi.fn());
const reportFailure = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/server", () => ({ capturePublicEvent, reportFailure }));

const { holdOnlineBooking, releaseOnlineBooking, submitOnlineBooking } = await import("./actions");
const { BOOKING_TERMS_VERSION } = await import("@/lib/legal/constants");

const SUBMISSION = "3f1c2b9a-7d4e-4a6b-9c1d-2e3f4a5b6c7d";

const HOLD = {
  submissionId: SUBMISSION,
  date: "2026-10-12",
  picks: [
    { courtId: 1, startsAt: "2026-10-12T09:00:00+00:00" },
    { courtId: 1, startsAt: "2026-10-12T10:00:00+00:00" },
  ],
  name: "Ana Reyes",
  phone: "0917 123 4567",
  email: "ana@example.com",
  consent: { rules: true, terms: true, privacy: true },
  turnstileToken: "turnstile-token",
};

const RUN = {
  court_id: 1,
  starts_at: "2026-10-12T09:00:00+00:00",
  ends_at: "2026-10-12T11:00:00+00:00",
  amount: 500,
};

const HELD_ANSWER = {
  ok: true,
  booking_id: 41,
  code: "K7MQ3XPT",
  status: "held",
  proof_path: `41/${SUBMISSION}`,
  hold_expires_at: "2026-10-01T01:05:00+00:00",
  server_now: "2026-10-01T01:00:00+00:00",
  amount: "500.00",
  runs: [RUN],
};

const SUBMITTED_ANSWER = {
  ...HELD_ANSWER,
  status: "pending_check",
  customer: { name: "Ana Reyes", phone: "+639171234567", email: "ana@example.com" },
  reference_last4: "1234",
  submitted_at: "2026-10-01T01:03:00+00:00",
  retaken: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  verifyTurnstile.mockResolvedValue(true);
  createSignedUploadUrl.mockResolvedValue({
    data: { signedUrl: "https://example.supabase.co/signed" },
    error: null,
  });
});

describe("holdOnlineBooking", () => {
  it("refuses a malformed request before the bot check or any token", async () => {
    const result = await holdOnlineBooking({
      ...HOLD,
      consent: { rules: true, terms: true, privacy: false },
    } as unknown as typeof HOLD);
    expect(result).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(mint).not.toHaveBeenCalled();
  });

  it("mints nothing and writes nothing for a caller Siteverify did not vouch for (AC-19)", async () => {
    verifyTurnstile.mockResolvedValue(false);
    const result = await holdOnlineBooking(HOLD);
    expect(result).toMatchObject({ ok: false, error: { kind: "bot_check" } });
    expect(verifyTurnstile).toHaveBeenCalledWith("turnstile-token", "203.0.113.7");
    expect(mint).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(capturePublicEvent).toHaveBeenCalledWith("online_booking_refused", {
      stage: "hold",
      reason: "bot_check",
    });
  });

  it("holds under a token minted for this client, sending no price (AC-4, AC-17, AC-20)", async () => {
    rpc.mockResolvedValue({ data: HELD_ANSWER, error: null });
    await holdOnlineBooking(HOLD);
    expect(mint).toHaveBeenCalledWith("client-hash");
    expect(rpc).toHaveBeenCalledWith("hold_online_booking", {
      p_submission_id: SUBMISSION,
      p_day: "2026-10-12",
      p_picks: [
        { court_id: 1, starts_at: "2026-10-12T09:00:00+00:00" },
        { court_id: 1, starts_at: "2026-10-12T10:00:00+00:00" },
      ],
      p_name: "Ana Reyes",
      p_phone: "+639171234567",
      p_email: "ana@example.com",
      p_terms_version: BOOKING_TERMS_VERSION,
    });
  });

  it("answers with the code, the database's clock and amount, and a signed URL for the issued path (AC-8, AC-9)", async () => {
    rpc.mockResolvedValue({ data: HELD_ANSWER, error: null });
    const result = await holdOnlineBooking(HOLD);
    expect(createSignedUploadUrl).toHaveBeenCalledWith(`41/${SUBMISSION}`, { upsert: true });
    expect(result).toEqual({
      ok: true,
      data: {
        code: "K7MQ3XPT",
        holdExpiresAt: "2026-10-01T01:05:00+00:00",
        serverNow: "2026-10-01T01:00:00+00:00",
        amount: 500,
        runs: [
          {
            courtId: 1,
            startsAt: "2026-10-12T09:00:00+00:00",
            endsAt: "2026-10-12T11:00:00+00:00",
            amount: 500,
          },
        ],
        upload: { signedUrl: "https://example.supabase.co/signed" },
      },
    });
    expect(capturePublicEvent).toHaveBeenCalledWith(
      "online_booking_held",
      expect.objectContaining({ slots: 2, courts: 1 }),
    );
  });

  it("names every taken slot, so the picker can mark them Booked (AC-6)", async () => {
    rpc.mockResolvedValue({
      data: {
        ok: false,
        reason: "slot_taken",
        slots: [{ court_id: 2, starts_at: "2026-10-12T10:00:00+00:00" }],
      },
      error: null,
    });
    const result = await holdOnlineBooking(HOLD);
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "slot_taken",
        message: expect.any(String),
        slots: [{ courtId: 2, startsAt: "2026-10-12T10:00:00+00:00" }],
      },
    });
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
    expect(capturePublicEvent).toHaveBeenCalledWith("online_booking_refused", {
      stage: "hold",
      reason: "slot_taken",
    });
  });

  it("hands on the wait from a rate limit refusal (AC-7, AC-19)", async () => {
    rpc.mockResolvedValue({
      data: { ok: false, reason: "rate_limited", retry_after_seconds: 540 },
      error: null,
    });
    const result = await holdOnlineBooking(HOLD);
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "rate_limited", retryAfterSeconds: 540 },
    });
  });

  it("maps out_of_range to its own refusal (AC-7)", async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: "out_of_range" }, error: null });
    const result = await holdOnlineBooking(HOLD);
    expect(result).toMatchObject({ ok: false, error: { kind: "out_of_range" } });
  });

  it("only warns on the database's invalid, and sends no event (AC-24)", async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: "invalid" }, error: null });
    const result = await holdOnlineBooking(HOLD);
    expect(result).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(capturePublicEvent).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it.each([
    ["an RPC error", { data: null, error: { code: "XX000", message: "boom" } }],
    ["an answer in an unexpected shape", { data: { ok: true, code: 1 }, error: null }],
  ])("reports %s as failed and sends no event", async (_, answer) => {
    rpc.mockResolvedValue(answer);
    const result = await holdOnlineBooking(HOLD);
    expect(result).toMatchObject({ ok: false, error: { kind: "failed" } });
    expect(reportFailure).toHaveBeenCalledWith(expect.anything(), {
      action: "holdOnlineBooking",
    });
    expect(capturePublicEvent).not.toHaveBeenCalled();
  });

  it("fails without a held event when the signed upload URL is refused", async () => {
    rpc.mockResolvedValue({ data: HELD_ANSWER, error: null });
    createSignedUploadUrl.mockResolvedValue({ data: null, error: { message: "denied" } });
    const result = await holdOnlineBooking(HOLD);
    expect(result).toMatchObject({ ok: false, error: { kind: "failed" } });
    expect(capturePublicEvent).not.toHaveBeenCalled();
  });
});

describe("submitOnlineBooking", () => {
  const SUBMIT = { submissionId: SUBMISSION, referenceLast4: "1234" };

  it("refuses malformed digits before calling the database", async () => {
    const result = await submitOnlineBooking({ ...SUBMIT, referenceLast4: "12a4" });
    expect(result).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends the submission and the digits, never a path (AC-12)", async () => {
    rpc.mockResolvedValue({ data: SUBMITTED_ANSWER, error: null });
    await submitOnlineBooking({ ...SUBMIT, proofPath: "9/elsewhere" });
    expect(rpc).toHaveBeenCalledWith("submit_online_booking", {
      p_submission_id: SUBMISSION,
      p_reference_last4: "1234",
    });
  });

  it("answers with the full receipt and no proof path (AC-14, AC-20)", async () => {
    rpc.mockResolvedValue({ data: SUBMITTED_ANSWER, error: null });
    const result = await submitOnlineBooking(SUBMIT);
    expect(result).toEqual({
      ok: true,
      data: {
        code: "K7MQ3XPT",
        status: "pending_check",
        amount: 500,
        runs: [
          {
            courtId: 1,
            startsAt: "2026-10-12T09:00:00+00:00",
            endsAt: "2026-10-12T11:00:00+00:00",
            amount: 500,
          },
        ],
        customer: { name: "Ana Reyes", phone: "+639171234567", email: "ana@example.com" },
        payment: { referenceLast4: "1234", submittedAt: "2026-10-01T01:03:00+00:00" },
        retaken: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain(`41/${SUBMISSION}`);
  });

  it("counts the submitted slots off the action's path (AC-24)", async () => {
    rpc.mockResolvedValue({ data: { ...SUBMITTED_ANSWER, retaken: true }, error: null });
    await submitOnlineBooking(SUBMIT);
    await vi.waitFor(() =>
      expect(capturePublicEvent).toHaveBeenCalledWith("online_booking_submitted", {
        slots: 2,
        retaken: true,
      }),
    );
  });

  it("names the slot gone after a lapse, for the refund message (AC-13)", async () => {
    rpc.mockResolvedValue({
      data: {
        ok: false,
        reason: "slot_taken",
        slots: [{ court_id: 1, starts_at: "2026-10-12T09:00:00+00:00" }],
      },
      error: null,
    });
    const result = await submitOnlineBooking(SUBMIT);
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "slot_taken", slots: [{ courtId: 1, startsAt: "2026-10-12T09:00:00+00:00" }] },
    });
    expect(capturePublicEvent).toHaveBeenCalledWith("online_booking_refused", {
      stage: "submit",
      reason: "slot_taken",
    });
  });

  it("asks for the screenshot again when none is at the path (AC-12)", async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: "proof_missing" }, error: null });
    const result = await submitOnlineBooking(SUBMIT);
    expect(result).toMatchObject({ ok: false, error: { kind: "proof_missing" } });
    expect(capturePublicEvent).toHaveBeenCalledWith("online_booking_refused", {
      stage: "submit",
      reason: "proof_missing",
    });
  });

  it("only warns on not_found, and sends no event (AC-24)", async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: "not_found" }, error: null });
    const result = await submitOnlineBooking(SUBMIT);
    expect(result).toMatchObject({ ok: false, error: { kind: "not_found" } });
    expect(capturePublicEvent).not.toHaveBeenCalled();
  });

  it("reports an RPC error as failed", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    const result = await submitOnlineBooking(SUBMIT);
    expect(result).toMatchObject({ ok: false, error: { kind: "failed" } });
    expect(reportFailure).toHaveBeenCalledWith(expect.anything(), {
      action: "submitOnlineBooking",
    });
  });
});

describe("releaseOnlineBooking", () => {
  it("refuses a malformed request without calling the database", async () => {
    expect(await releaseOnlineBooking({ submissionId: "nope" })).toEqual({ released: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says whether a live hold was ended (AC-15)", async () => {
    rpc.mockResolvedValue({ data: { ok: true, released: true }, error: null });
    expect(await releaseOnlineBooking({ submissionId: SUBMISSION })).toEqual({ released: true });
    expect(rpc).toHaveBeenCalledWith("release_online_booking", { p_submission_id: SUBMISSION });
  });

  it("reports an RPC error and releases nothing, leaving it to the minute job (AC-16)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    expect(await releaseOnlineBooking({ submissionId: SUBMISSION })).toEqual({ released: false });
    expect(reportFailure).toHaveBeenCalledWith(expect.anything(), {
      action: "releaseOnlineBooking",
    });
  });
});
