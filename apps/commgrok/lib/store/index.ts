import { isSupabaseMode } from "../config";
import { localStore } from "./local";
import { supabaseStore } from "./supabase";
import type { Store } from "./types";

export function getStore(): Store {
  return isSupabaseMode() ? supabaseStore : localStore;
}

export { DuplicateError } from "./types";
export type { User } from "./types";
