import { describe, expect, it } from "vitest";

import {
  bookFormSchema,
  closeEditFormSchema,
  closeFormSchema,
  EMPTY_BOOK_FORM,
  toCustomerFields,
  toCustomerPatch,
} from "./forms";

/**
 * Spec 0005, AC-4 and AC-8: what the sheets accept as typed, and how a blank
 * box becomes an absent field on a create and a null on an edit.
 */

describe("bookFormSchema", () => {
  it("accepts the empty form with only a name filled in", () => {
    expect(bookFormSchema.safeParse({ ...EMPTY_BOOK_FORM, customerName: "Maria" }).success).toBe(
      true,
    );
  });

  it("refuses a blank name with the booking's own message (AC-4)", () => {
    const result = bookFormSchema.safeParse(EMPTY_BOOK_FORM);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]).toMatchObject({
      path: ["customerName"],
      message: "A booking needs a customer name.",
    });
  });

  it("takes an empty phone, a loose phone, and refuses letters (AC-4)", () => {
    const base = { ...EMPTY_BOOK_FORM, customerName: "Maria" };
    expect(bookFormSchema.safeParse({ ...base, customerPhone: "" }).success).toBe(true);
    expect(bookFormSchema.safeParse({ ...base, customerPhone: "0917-123-4567" }).success).toBe(
      true,
    );
    expect(bookFormSchema.safeParse({ ...base, customerPhone: "call me" }).success).toBe(false);
  });

  it("takes an amount as text with up to two decimals, or blank, and refuses the rest", () => {
    const base = { ...EMPTY_BOOK_FORM, customerName: "Maria" };
    expect(bookFormSchema.safeParse({ ...base, amount: "" }).success).toBe(true);
    expect(bookFormSchema.safeParse({ ...base, amount: "250.50" }).success).toBe(true);
    expect(bookFormSchema.safeParse({ ...base, amount: "-5" }).success).toBe(false);
    expect(bookFormSchema.safeParse({ ...base, amount: "1.234" }).success).toBe(false);
    expect(bookFormSchema.safeParse({ ...base, amount: "lots" }).success).toBe(false);
  });

  it("cuts a note at 200 characters", () => {
    const base = { ...EMPTY_BOOK_FORM, customerName: "Maria" };
    expect(bookFormSchema.safeParse({ ...base, note: "x".repeat(200) }).success).toBe(true);
    expect(bookFormSchema.safeParse({ ...base, note: "x".repeat(201) }).success).toBe(false);
  });
});

describe("closeFormSchema and closeEditFormSchema", () => {
  it("needs nothing for a closure, and an end time for a closure edit (AC-5, AC-8)", () => {
    expect(closeFormSchema.safeParse({ note: "" }).success).toBe(true);
    expect(closeEditFormSchema.safeParse({ note: "", endTime: "" }).success).toBe(false);
    expect(closeEditFormSchema.safeParse({ note: "", endTime: "21:00" }).success).toBe(true);
  });
});

describe("toCustomerFields and toCustomerPatch", () => {
  const typed = {
    customerName: "Maria",
    customerPhone: "",
    note: "",
    paymentStatus: "paid" as const,
    amount: "250.5",
  };

  it("drops blanks on a create, so the database defaults apply", () => {
    expect(toCustomerFields(typed)).toEqual({
      customerName: "Maria",
      customerPhone: undefined,
      note: undefined,
      paymentStatus: "paid",
      amount: 250.5,
    });
  });

  it("sends blanks as null on an edit, so a cleared field actually clears (AC-8)", () => {
    expect(toCustomerPatch({ ...typed, amount: "" })).toEqual({
      customerName: "Maria",
      customerPhone: null,
      note: null,
      paymentStatus: "paid",
      amount: null,
    });
  });
});
