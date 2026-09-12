import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

import { publicEnv } from "@/lib/env";

/**
 * The signed in staff client. Architecture rules 1, 2 and 10 in spec 0001.
 *
 * Created fresh per request, never cached in a module level singleton, because it
 * carries one particular staff member's Clerk token. Supabase trusts Clerk as a
 * third party auth provider, so the token arrives in the database as
 * `auth.jwt()->>'sub'` and the row level security policies decide what this person
 * may do. There is no service role key here and there never should be.
 */
export function staffSupabase(): SupabaseClient<Database> {
  const env = publicEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    accessToken: async () => (await auth()).getToken(),
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
