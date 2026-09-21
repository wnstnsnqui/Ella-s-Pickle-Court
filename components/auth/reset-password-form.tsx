"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

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
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/lib/auth/actions";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";
import { resetPasswordFormSchema, type ResetPasswordFormInput } from "@/lib/auth/schemas";

import { FormError, SubmitButton } from "./form-pieces";

/**
 * Set a new password from a reset link. Spec 0004 (revised), AC-7.
 *
 * The username is shown read only so the person knows whose password they
 * are setting; the link decides the account, not the form. Success deletes every
 * session of that account and lands on `/sign-in?reset=1`.
 */
export function ResetPasswordForm({ token, username }: { token: string; username: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ResetPasswordFormInput>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: "", confirm: "" },
  });

  async function submit(values: ResetPasswordFormInput) {
    setPending(true);
    setError(null);
    const result = await resetPassword({ token, password: values.password });
    if (!result.ok) {
      setPending(false);
      if (result.error.kind === "invalid" && result.error.issues?.password) {
        form.setError("password", { message: result.error.issues.password[0] });
        return;
      }
      setError(result.error.message);
      return;
    }
    router.replace("/sign-in?reset=1");
  }

  return (
    <Form {...form}>
      <form noValidate className="flex flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="reset-username">Username</Label>
          <Input id="reset-username" value={username ?? "No username on file"} readOnly disabled />
        </div>
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input {...field} type="password" autoComplete="new-password" autoFocus />
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
        <FormError message={error} />
        <SubmitButton pending={pending} pendingLabel="Saving">
          Set password
        </SubmitButton>
        <p className="text-caption text-muted-foreground">
          This signs you out everywhere. Sign in again with the new password.
        </p>
      </form>
    </Form>
  );
}
