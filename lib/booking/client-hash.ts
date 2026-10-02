import "server-only";

import { createHmac } from "node:crypto";

import { bookingEnv } from "@/lib/env";

/**
 * Who is asking, for the rate limit, without keeping an address. Spec 0015,
 * AC-19 and the Decision.
 *
 * An HMAC, not a plain hash: anyone could reverse a plain SHA256 over the IPv4
 * space in minutes. A request with no address hashes the fixed string
 * `unknown`, so all such requests share one limit rather than escaping it.
 */
export function hashClient(address: string | null): string {
  return createHmac("sha256", bookingEnv().BOOKING_CLIENT_HASH_SECRET)
    .update(address ?? "unknown")
    .digest("hex");
}
