import { z } from "zod";

import {
  amountSchema,
  customerNameSchema,
  customerPhoneSchema,
  noteSchema,
  paymentStatusSchema,
} from "@/lib/schedule/schemas";

/**
 * What the sheets collect, as typed. Spec 0005, AC-4, AC-5 and AC-8.
 *
 * The field rules are the ones the Server Actions enforce, imported rather than
 * copied, so a form can never accept what the boundary refuses. The two
 * differences are about text boxes: an empty phone or amount is a blank input
 * here and an absent field on the wire, and the amount is typed as a string
 * because that is what an input holds.
 */

const optionalPhone = z.union([z.literal(""), customerPhoneSchema]);

const amountText = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || amountSchema.safeParse(Number(value)).success,
    "Enter an amount in pesos, like 500 or 250.50.",
  );

export const bookFormSchema = z.object({
  customerName: customerNameSchema,
  customerPhone: optionalPhone,
  note: noteSchema,
  paymentStatus: paymentStatusSchema,
  amount: amountText,
});

export type BookFormValues = z.infer<typeof bookFormSchema>;

export const closeFormSchema = z.object({
  note: noteSchema,
});

export type CloseFormValues = z.infer<typeof closeFormSchema>;

export const closeEditFormSchema = z.object({
  note: noteSchema,
  endTime: z.string().min(1, "Pick an end time."),
});

export type CloseEditFormValues = z.infer<typeof closeEditFormSchema>;

export const EMPTY_BOOK_FORM: BookFormValues = {
  customerName: "",
  customerPhone: "",
  note: "",
  paymentStatus: "unpaid",
  amount: "",
};

/** The customer fields as the action wants them: blanks dropped, the amount a number. */
export function toCustomerFields(values: BookFormValues) {
  return {
    customerName: values.customerName,
    customerPhone: values.customerPhone === "" ? undefined : values.customerPhone,
    note: values.note === "" ? undefined : values.note,
    paymentStatus: values.paymentStatus,
    amount: values.amount === "" ? undefined : Number(values.amount),
  };
}

/**
 * The same fields for an edit, where a cleared field must reach the row as
 * null. `withPayment` is false on an online booking's row: its payment and
 * amount are never sent, because only the staff check may change them (spec
 * 0016, AC-11).
 */
export function toCustomerPatch(values: BookFormValues, withPayment = true) {
  const contact = {
    customerName: values.customerName,
    customerPhone: values.customerPhone === "" ? null : values.customerPhone,
    note: values.note === "" ? null : values.note,
  };
  if (!withPayment) return contact;
  return {
    ...contact,
    paymentStatus: values.paymentStatus,
    amount: values.amount === "" ? null : Number(values.amount),
  };
}
