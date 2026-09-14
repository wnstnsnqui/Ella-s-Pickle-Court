"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

import { publicEnv } from "@/lib/env";

/**
 * The browser client the staff board uses to listen. Spec 0005, invariant 6.
 *
 * A second module and a second instance on purpose, never merged with
 * `browser.ts`: this one has the signed in staff member's Clerk token applied
 * with `realtime.setAuth()`, so the socket joins the private `schedule` topic
 * as `authenticated`. It never writes; every write is a Server Action. It is
 * created only under `/staff`, and memoised so a re-render never opens a
 * second websocket.
 */
let client: SupabaseClient<Database> | undefined;

export function staffBrowserSupabase(): SupabaseClient<Database> {
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
