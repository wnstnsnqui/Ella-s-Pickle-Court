// Spec 0015, AC-23: delete the payment screenshots that are due.
//
// Called nightly by `pg_cron` through `pg_net` (`private.request_payment_proof_purge()`),
// with the shared secret from Vault in `x-purge-secret`. The gate is that
// secret, not a Supabase JWT, so the function is deployed with JWT
// verification off (`supabase/config.toml`).
//
// It uses the service role key Supabase gives every Edge Function. That key
// stays here, inside Supabase: nothing under `app/` or `lib/` reads it.
//
// Deploy: npx supabase functions deploy purge-payment-proofs --no-verify-jwt
// Secret: npx supabase secrets set PROOF_PURGE_SECRET=<the value in Vault>

import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "payment-proof";
/** Paths per round. Storage removes up to 1000 per call; a smaller batch keeps each round quick. */
const BATCH = 100;
/** A backlog larger than this clears over the following nights. */
const MAX_ROUNDS = 20;

/** Compares two secrets in time that does not depend on where they differ. */
function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

  const expected = Deno.env.get("PROOF_PURGE_SECRET");
  if (!expected) {
    console.error("purge-payment-proofs: PROOF_PURGE_SECRET is not set");
    return json({ error: "not configured" }, 500);
  }
  if (!sameSecret(request.headers.get("x-purge-secret") ?? "", expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") as string,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let deleted = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const due = await supabase.rpc("payment_proofs_due", { p_limit: BATCH });
    if (due.error) {
      console.error("purge-payment-proofs: payment_proofs_due failed", due.error.message);
      return json({ error: "read failed", deleted }, 500);
    }
    const paths = (due.data as { proof_path: string }[]).map((row) => row.proof_path);
    if (paths.length === 0) break;

    // Delete first, forget second: a failure between the two leaves the path
    // on the booking, and the next night deletes it again (a missing object
    // is not an error), rather than forgetting a file that still exists.
    const removed = await supabase.storage.from(BUCKET).remove(paths);
    if (removed.error) {
      console.error("purge-payment-proofs: storage remove failed", removed.error.message);
      return json({ error: "delete failed", deleted }, 500);
    }

    const forgot = await supabase.rpc("forget_payment_proofs", { p_paths: paths });
    if (forgot.error) {
      console.error("purge-payment-proofs: forget_payment_proofs failed", forgot.error.message);
      return json({ error: "forget failed", deleted }, 500);
    }

    deleted += paths.length;
    if (paths.length < BATCH) break;
  }

  console.info(`purge-payment-proofs: deleted ${deleted}`);
  return json({ deleted });
});
