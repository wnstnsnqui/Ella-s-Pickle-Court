import { describe, expect, it } from "vitest";

import { formatBookingCode } from "./code";
import {
  bookingCodeSchema,
  bookingDetailsSchema,
  holdInputSchema,
  lookupAnswerSchema,
  normalizePhilippineMobile,
  referenceLast4Schema,
  submitInputSchema,
} from "./schemas";

/** Spec 0015, AC-2, AC-8, AC-12 and AC-18: what the sheet and the actions accept. */

const SUBMISSION = "3f1c2b9a-7d4e-4a6b-9c1d-2e3f4a5b6c7d";

describe("normalizePhilippineMobile", () => {
  it.each([
    ["09171234567", "+639171234567"],
    ["0917 123 4567", "+639171234567"],
    ["0917-123-4567", "+639171234567"],
    ["+63 917 123 4567", "+639171234567"],
    ["+63-917-123-4567", "+639171234567"],
    ["+639171234567", "+639171234567"],
  ])("stores %s as %s", (input, stored) => {
    expect(normalizePhilippineMobile(input)).toBe(stored);
  });

  it.each([
    ["too short", "12345"],
    ["a landline", "02 8123 4567"],
    ["a mobile without the 9", "0817 123 4567"],
    ["one digit too many", "0917 123 45678"],
    ["63 without the plus", "63 917 123 4567"],
    ["another country", "+1 415 555 0123"],
    ["letters", "0917 ABC 4567"],
  ])("refuses %s", (_, input) => {
    expect(normalizePhilippineMobile(input)).toBeNull();
  });
});

describe("bookingDetailsSchema", () => {
  const valid = { name: "  Ana Reyes  ", phone: "0917-123 4567", email: " ana@example.com " };

  it("trims the name and email and stores the phone in one form", () => {
    expect(bookingDetailsSchema.parse(valid)).toEqual({
      name: "Ana Reyes",
      phone: "+639171234567",
      email: "ana@example.com",
    });
  });

  it("marks every blank required field with its own message", () => {
    const result = bookingDetailsSchema.safeParse({ name: " ", phone: "", email: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]));
    expect(messages).toEqual({
      name: "Enter your name.",
      phone: "Enter your mobile number.",
    });
  });

  it("takes a blank email as no email at all (amended 2026-10-05)", () => {
    expect(bookingDetailsSchema.parse({ ...valid, email: "   " }).email).toBeNull();
  });

  it("names the phone format it wants", () => {
    const result = bookingDetailsSchema.safeParse({ ...valid, phone: "12345" });
    expect(result.error?.issues[0]?.message).toBe(
      "Use a Philippine mobile number, like 0917 123 4567.",
    );
  });

  it("allows a name of 80 characters and refuses 81", () => {
    expect(bookingDetailsSchema.safeParse({ ...valid, name: "a".repeat(80) }).success).toBe(true);
    expect(bookingDetailsSchema.safeParse({ ...valid, name: "a".repeat(81) }).success).toBe(false);
  });

  it("refuses an email that is not an address, or longer than 254 characters", () => {
    expect(bookingDetailsSchema.safeParse({ ...valid, email: "ana@" }).success).toBe(false);
    const long = `${"a".repeat(245)}@example.com`;
    expect(bookingDetailsSchema.safeParse({ ...valid, email: long }).success).toBe(false);
  });
});

describe("holdInputSchema", () => {
  const hold = {
    submissionId: SUBMISSION,
    date: "2026-10-12",
    picks: [{ courtId: 1, startsAt: "2026-10-12T09:00:00+00:00" }],
    name: "Ana Reyes",
    phone: "09171234567",
    email: "ana@example.com",
    consent: { rules: true, terms: true, privacy: true },
    turnstileToken: "token",
  };

  it("accepts a hold and carries no price", () => {
    const parsed = holdInputSchema.parse(hold);
    expect(parsed.phone).toBe("+639171234567");
    expect(parsed).not.toHaveProperty("amount");
  });

  it("drops a price the browser tries to send (AC-17)", () => {
    const parsed = holdInputSchema.parse({ ...hold, amount: 1 });
    expect(parsed).not.toHaveProperty("amount");
  });

  it.each([
    ["the rules not ticked", { consent: { rules: false, terms: true, privacy: true } }],
    ["the terms not ticked", { consent: { rules: true, terms: false, privacy: true } }],
    ["the privacy consent not ticked", { consent: { rules: true, terms: true } }],
    ["no consent at all", { consent: undefined }],
    ["no picks", { picks: [] }],
    ["no bot check token", { turnstileToken: "" }],
    ["a submission id that is not a v4 UUID", { submissionId: "not-a-uuid" }],
    ["a pick with no timezone", { picks: [{ courtId: 1, startsAt: "2026-10-12T09:00:00" }] }],
  ])("refuses %s", (_, change) => {
    expect(holdInputSchema.safeParse({ ...hold, ...change }).success).toBe(false);
  });
});

describe("the reference digits (AC-8, AC-12)", () => {
  it.each(["1234", "0000", " 9876 "])("accepts %j", (digits) => {
    expect(referenceLast4Schema.safeParse(digits).success).toBe(true);
  });

  it.each(["123", "12345", "12a4", ""])("refuses %j", (digits) => {
    expect(referenceLast4Schema.safeParse(digits).success).toBe(false);
  });

  it("takes the digits and the submission, never a path", () => {
    const parsed = submitInputSchema.parse({
      submissionId: SUBMISSION,
      referenceLast4: "1234",
      proofPath: "1/elsewhere",
    });
    expect(parsed).toEqual({ submissionId: SUBMISSION, referenceLast4: "1234" });
  });
});

describe("formatBookingCode (AC-18)", () => {
  it("groups a stored code as XXXX-XXXX", () => {
    expect(formatBookingCode("K7MQ3XPT")).toBe("K7MQ-3XPT");
  });

  it("leaves anything that is not 8 characters as it is", () => {
    expect(formatBookingCode("K7MQ")).toBe("K7MQ");
  });
});

/** Spec 0017, AC-2 and AC-18: the code as typed, and the lookup's answer kept to its keys. */
describe("bookingCodeSchema", () => {
  it("takes the code with any case, spaces or dashes, and gives it back as stored", () => {
    for (const typed of ["K7MQ3XPT", "k7mq-3xpt", " K7MQ 3XPT ", "k7-mq-3x-pt"]) {
      expect(bookingCodeSchema.parse(typed)).toBe("K7MQ3XPT");
    }
  });

  it("refuses a code of the wrong length or with a letter the alphabet leaves out", () => {
    for (const typed of [
      "",
      "K7MQ3XP",
      "K7MQ3XPTA",
      "K7MQ3XP0",
      "K7MQ3XP1",
      "K7MQ3XPI",
      "K7MQ3XPL",
      "K7MQ3XPO",
      "K7MQ3XP!",
    ]) {
      expect(bookingCodeSchema.safeParse(typed).success).toBe(false);
    }
  });
});

describe("lookupAnswerSchema", () => {
  const found = {
    ok: true,
    view: "confirmed",
    code: "K7MQ3XPT",
    reason: null,
    refund_status: null,
    refund_amount: null,
    refunded_at: null,
    first_name: "Ana",
    phone_last4: "4567",
    email_masked: "a•••@example.com",
    amount: "250.00",
    submitted_at: "2026-10-01T01:03:00+00:00",
    runs: [],
  };

  it("accepts exactly the keys the spec allows", () => {
    expect(lookupAnswerSchema.safeParse(found).success).toBe(true);
  });

  it("refuses an answer carrying anything more, a booking id or a full phone", () => {
    expect(lookupAnswerSchema.safeParse({ ...found, booking_id: 41 }).success).toBe(false);
    expect(
      lookupAnswerSchema.safeParse({ ...found, customer_phone: "+639171234567" }).success,
    ).toBe(false);
  });
});
