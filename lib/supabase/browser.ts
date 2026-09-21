"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

import { publicEnv } from "@/lib/env";

/**
 * The browser client the public board uses to listen for court broadcasts.
 *
 * Anon key and no session, so it is read only exactly like `publicSupabase()`.
 * Since spec 0004 (revised) the staff board listens through this same client:
 * the `schedule` topic is readable by `anon`, and every staff read goes through
 * a Server Action with the session, never through the socket.
 * One instance per tab: a second client would open a second websocket for no gain.
 */
let client: SupabaseClient<Database> | undefined;

export function browserSupabase(): SupabaseClient<Database> {
  if (!client) {
    const env = publicEnv();
    client = createClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }
  return client;
}
