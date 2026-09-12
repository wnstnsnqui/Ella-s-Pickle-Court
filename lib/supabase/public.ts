import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

import { publicEnv } from "@/lib/env";

/**
 * The public read client. Architecture rules 4 and 10 in spec 0001.
 *
 * It carries the anon key and no Clerk token, so the database sees an anonymous
 * caller and only the explicit read only policies apply. This client must never
 * be given a staff token, and it must never be merged with `staffSupabase()`.
 * They are two different callers and keeping them apart is what makes the read
 * only guarantee on the public board real.
 */
export function publicSupabase(): SupabaseClient<Database> {
  const env = publicEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
