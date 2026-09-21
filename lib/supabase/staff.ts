import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { mintStaffToken } from "./staff-token";

import { currentSubject } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";

/**
 * The signed in staff client. Architecture rules 1, 2 and 10 in spec 0001;
 * the bridge in spec 0004 (revised), AC-6.
 *
 * Created fresh per request, never cached in a module level singleton, because it
 * carries one particular staff member's token. That token is minted here from
 * the confirmed Better Auth session by `mintStaffToken()`, so it arrives in the
 * database as `auth.jwt()->>'sub'` and the row level security policies decide
 * what this person may do. There is no service role key here and there never
 * should be.
 */
export function staffSupabase(): SupabaseClient<Database> {
  const env = publicEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    accessToken: async () => {
      const subject = await currentSubject();
      return subject ? mintStaffToken(subject) : null;
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
