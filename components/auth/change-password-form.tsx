"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/auth/schemas";

import { FormError, FormFooter, SubmitButton } from "./form-pieces";

/**
 * Change password, on the account page. Spec 0004 (revised), AC-9.
 *
 * Goes straight to Better Auth from the browser with `revokeOtherSessions`,
 * so every other device is signed out and this one stays. A wrong current
 * password lands under its field; anything else is a form level error.
 */
export function ChangePasswordForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", password: "", confirm: "" },
  });

  async function submit(values: ChangePasswordInput) {
    setPending(true);
    setError(null);
    const result = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.password,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (result.error) {
      if (result.error.status === 400 || result.error.status === 401) {
        form.setError("currentPassword", { message: "That is not your current password." });
        form.setFocus("currentPassword");
        return;
      }
      setError(
        result.error.status === 429
          ? "Too many attempts. Wait a moment, then try again."
          : "Could not change your password right now. Try again in a moment.",
      );
      return;
    }
    toast.success("Password changed. Other devices have been signed out.");
    form.reset();
  }

  return (
    <Form {...form}>
      <form noValidate className="flex flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
        <div className="flex max-w-md flex-col gap-4">
          <FormField
            control={form.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current password</FormLabel>
                <FormControl>
                  <Input {...field} type="password" autoComplete="current-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
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
                <FormLabel>New password again</FormLabel>
                <FormControl>
                  <Input {...field} type="password" autoComplete="new-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormError message={error} />
        <FormFooter note="Every other device you are signed in on is signed out; this one stays.">
          <SubmitButton pending={pending} pendingLabel="Saving" className="w-auto">
            Change password
          </SubmitButton>
        </FormFooter>
      </form>
    </Form>
  );
}
