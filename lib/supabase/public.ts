import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Server-side Supabase client for Route Handlers (no cookies; RLS with anon key). */
export function getPublicSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
