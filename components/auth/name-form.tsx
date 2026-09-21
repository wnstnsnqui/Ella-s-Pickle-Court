"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
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
import { updateNameSchema, type UpdateNameInput } from "@/lib/auth/schemas";

import { FormError, FormFooter, SubmitButton } from "./form-pieces";

/**
 * Edit your own name, on the account page. Spec 0004 (revised), AC-9.
 *
 * The name lives on the Better Auth user; `updateUser` rewrites the session
 * cookie with it, and the `router.refresh()` that follows makes
 * `ensure_staff()` copy it onto the `staff` row (AC-5). So the header, the
 * users screen and every `changed_by` lookup show the new name from the next
 * render on. Nothing here touches the schedule database directly.
 */

export function NameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<UpdateNameInput>({
    resolver: zodResolver(updateNameSchema),
    defaultValues: { name: initialName },
  });

  async function submit(values: UpdateNameInput) {
    if (values.name === initialName) {
      toast.info("That is already your name.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await authClient.updateUser({ name: values.name });
    setPending(false);
    if (result.error) {
      setError(
        result.error.status === 429
          ? "Too many attempts. Wait a moment, then try again."
          : "Could not save your name right now. Try again in a moment.",
      );
      return;
    }
    toast.success("Name saved.");
    form.reset({ name: values.name });
    router.refresh();
  }

  return (
    <Form {...form}>
      <form noValidate className="flex flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="max-w-md">
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="name" maxLength={80} />
              </FormControl>
              <FormDescription>
                Shown on the board and on every booking and change you make.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormError message={error} />
        <FormFooter>
          <SubmitButton pending={pending} pendingLabel="Saving" className="w-auto">
            Save name
          </SubmitButton>
        </FormFooter>
      </form>
    </Form>
  );
}
