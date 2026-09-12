"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

import { publicEnv } from "@/lib/env";

/**
 * The browser client the public board uses to listen for court broadcasts.
 *
 * Anon key, no Clerk token, so it is read only exactly like `publicSupabase()`.
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
