import type { TransportResult } from "@/components/schedule/use-schedule-channel";

/**
 * What the staff board makes of `refreshStaffSchedule`'s answer. Spec 0014,
 * AC-5 and AC-6.
 *
 * Only `failed` (the database or the network behind the action gave out) is
 * worth asking again. Every other kind is an answer, not a fault: a retry of
 * `forbidden` or `unauthenticated` would ask the same question of the same
 * policy and get the same no. An `out_of_range` refusal is handed on as such
 * (spec 0007, AC-12).
 *
 * Plain module, typed by shape, so it is tested without the Server Action.
 */
type StaffReadAnswer<T> =
  { ok: true; data: T } | { ok: false; error: { kind: string; message: string; reason?: string } };

export function toStaffTransportResult<T>(answer: StaffReadAnswer<T>): TransportResult<T> {
  if (answer.ok) return { ok: true, data: answer.data };
  const { kind, message, reason } = answer.error;
  if (kind === "invalid" && reason === "out_of_range") {
    return { ok: false, message, retry: false, reason: "out_of_range" };
  }
  return { ok: false, message, retry: kind === "failed" };
}

/** A call that threw (the connection dropped) is always worth another go. */
export function staffTransportThrew(error: unknown): TransportResult<never> {
  const message = error instanceof Error ? error.message : "The schedule did not reload.";
  return { ok: false, message, retry: true };
}
