import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

/** True only when both public env vars are set. The build still succeeds when they are not. */
export const supabaseConfigured = url.length > 0 && anonKey.length > 0;

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  return supabase;
}
