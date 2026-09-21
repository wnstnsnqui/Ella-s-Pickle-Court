"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { redeemInvite, type AuthActionResult } from "@/lib/auth/actions";
import {
  PASSWORD_MIN_LENGTH,
  placeholderEmail,
  STAFF_HOME,
  STAFF_ONLY_LINE,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "@/lib/auth/constants";
import { createAccountSchema } from "@/lib/auth/schemas";

import { FormError, SubmitButton } from "./form-pieces";

/**
 * Create an account: the bootstrap owner at `/sign-up`, or a new hire at
 * `/sign-up/[token]`. Spec 0004 (revised), AC-1, AC-2.
 *
 * One form, two doors. Bootstrap calls Better Auth directly from the
 * browser, and the `user.create.before` hook allows it only while no user
 * exists and the username is the bootstrap one. An invite goes through
 * `redeemInvite`, which carries the token to that same hook as a signed
 * cookie. Both send the placeholder email the hook insists on.
 */

const formSchema = createAccountSchema
  .extend({ confirm: z.string() })
  .refine((value) => value.password === value.confirm, {
    error: "The two passwords do not match.",
    path: ["confirm"],
  });
type FormValues = z.infer<typeof formSchema>;

const DOWN = "Could not create your account right now. Try again in a moment.";
const TAKEN = "That username is taken. Choose another one.";

export type CreateAccountMode = { kind: "bootstrap" } | { kind: "invite"; token: string };

export function CreateAccountForm({ mode }: { mode: CreateAccountMode }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", username: "", password: "", confirm: "" },
  });

  function land() {
    router.replace(STAFF_HOME);
    router.refresh();
  }

  function showRefusal(result: Exclude<AuthActionResult, { ok: true }>) {
    const { error: refusal } = result;
    if (refusal.kind === "invalid" && refusal.issues) {
      for (const [field, messages] of Object.entries(refusal.issues)) {
        if (field === "name" || field === "username" || field === "password") {
          form.setError(field, { message: messages[0] });
        }
      }
    }
    if (refusal.kind === "username_taken") {
      form.setError("username", { message: refusal.message });
      return;
    }
    setError(refusal.message);
  }

  async function submit(values: FormValues) {
    setPending(true);
    setError(null);
    const body = { name: values.name, username: values.username, password: values.password };

    if (mode.kind === "bootstrap") {
      const result = await authClient.signUp.email({
        ...body,
        email: placeholderEmail(values.username),
      });
      if (result.error) {
        setPending(false);
        const status = result.error.status;
        if (status === 400 || status === 422) {
          form.setError("username", { message: TAKEN });
          return;
        }
        setError(status === 403 ? STAFF_ONLY_LINE : status === 429 ? "Too many attempts." : DOWN);
        return;
      }
      land();
      return;
    }

    const result = await redeemInvite({ token: mode.token, ...body });
    if (!result.ok) {
      setPending(false);
      showRefusal(result);
      return;
    }
    land();
  }

  return (
    <div className="flex flex-col gap-6">
      <Form {...form}>
        <form noValidate className="flex flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Your name</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete="name" autoFocus maxLength={80} />
                </FormControl>
                <FormDescription>Shown on the board and on every change you make.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={USERNAME_MAX_LENGTH}
                  />
                </FormControl>
                <FormDescription>
                  What you sign in with, {USERNAME_MIN_LENGTH} to {USERNAME_MAX_LENGTH} letters,
                  numbers, dots or underscores. It cannot be changed later.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input {...field} type="password" autoComplete="new-password" />
                </FormControl>
                <FormDescription>At least {PASSWORD_MIN_LENGTH} characters.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password again</FormLabel>
                <FormControl>
                  <Input {...field} type="password" autoComplete="new-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormError message={error} />
          <SubmitButton pending={pending} pendingLabel="Creating your account">
            Create account
          </SubmitButton>
        </form>
      </Form>
    </div>
  );
}
