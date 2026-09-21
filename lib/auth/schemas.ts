import { z } from "zod";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from "./constants";

/**
 * The four auth forms' boundaries, shared by the Client Components (through
 * `react-hook-form`'s resolver) and the Server Actions. Spec 0004 (revised),
 * AC-9 and AC-16. A plain module: no `server-only`.
 */

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(USERNAME_MIN_LENGTH, { error: `Use at least ${USERNAME_MIN_LENGTH} characters.` })
      .max(USERNAME_MAX_LENGTH, { error: `Use at most ${USERNAME_MAX_LENGTH} characters.` })
      .regex(USERNAME_PATTERN, {
        error: "Letters, numbers, dots and underscores only, and no dot at either end.",
      }),
  );

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    error: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    error: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  });

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, { error: "Enter the name the board should show." })
  .max(80, { error: "Keep the name to 80 characters." });

/** A link's plain token: 32 random bytes as base64url, 43 characters. */
export const linkTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, {
  error: "That link is not a staff link.",
});

export const signInSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, { error: "Enter your password." }),
});
export type SignInInput = z.infer<typeof signInSchema>;

/** The bootstrap form and the invite form share one shape. */
export const createAccountSchema = z.object({
  name: displayNameSchema,
  username: usernameSchema,
  password: passwordSchema,
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const redeemInviteSchema = createAccountSchema.extend({ token: linkTokenSchema });

const confirmed = <S extends z.ZodObject<{ password: z.ZodString; confirm: z.ZodString }>>(
  schema: S,
) =>
  schema.refine((value) => value.password === value.confirm, {
    error: "The two passwords do not match.",
    path: ["confirm"],
  });

export const resetPasswordFormSchema = confirmed(
  z.object({ password: passwordSchema, confirm: z.string() }),
);
export type ResetPasswordFormInput = z.infer<typeof resetPasswordFormSchema>;

export const resetPasswordSchema = z.object({ token: linkTokenSchema, password: passwordSchema });

/** The name form on the account page (AC-9). */
export const updateNameSchema = z.object({ name: displayNameSchema });
export type UpdateNameInput = z.infer<typeof updateNameSchema>;
export const changePasswordSchema = confirmed(
  z.object({
    currentPassword: z.string().min(1, { error: "Enter your current password." }),
    password: passwordSchema,
    confirm: z.string(),
  }),
);
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Where to land after sign in. Only a same origin path is honoured: anything
 * with a scheme, a host or a protocol relative `//` goes to `/staff` (AC-4).
 */
export function safeRedirect(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  return value;
}
