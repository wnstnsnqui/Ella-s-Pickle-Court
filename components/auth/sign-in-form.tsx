"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { signInSchema, type SignInInput } from "@/lib/auth/schemas";

import { FormError, SubmitButton } from "./form-pieces";

/**
 * Sign in by username and password. Spec 0004 (revised), AC-4, AC-14, AC-15.
 *
 * `redirect` is already a checked same origin path (the page ran it through
 * `safeRedirect`). The username is lower cased by the schema before it is
 * sent, so `Ella` and `ella` are the same account.
 */

const WRONG = "Username or password is wrong.";
const TOO_MANY = "Too many attempts. Wait a moment, then try again.";
const DOWN = "Could not sign in right now. Try again in a moment.";

export function SignInForm({
  redirect,
  initialError,
}: {
  redirect: string;
  initialError: "reset" | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { username: "", password: "" },
  });

  async function submit(values: SignInInput) {
    setPending(true);
    setError(null);
    const result = await authClient.signIn.username({
      username: values.username,
      password: values.password,
    });
    if (result.error) {
      setPending(false);
      const status = result.error.status;
      setError(status === 401 ? WRONG : status === 429 ? TOO_MANY : DOWN);
      form.setFocus("password");
      return;
    }
    router.replace(redirect);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {initialError === "reset" ? (
        <p role="status" className="text-body text-primary">
          Your password was changed. Sign in with the new one.
        </p>
      ) : null}
      <Form {...form}>
        <form noValidate className="flex flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
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
                    autoFocus
                  />
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
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input {...field} type="password" autoComplete="current-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormError message={error} />
          <SubmitButton pending={pending} pendingLabel="Signing in">
            Sign in
          </SubmitButton>
        </form>
      </Form>
      <p className="text-caption text-muted-foreground">
        Forgot your password? Ask Ella for a reset link.
      </p>
    </div>
  );
}
