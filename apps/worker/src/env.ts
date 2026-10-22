import { config } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root (`community-bot/`). */
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export const PASTE_SERVICE_ROLE = "Paste SUPABASE_SERVICE_ROLE_KEY into apps/worker/.env";

/**
 * Root `.env` first, then `apps/worker/.env` overriding it.
 * Missing files are ignored.
 */
export function loadEnv(): void {
  config({ path: join(repoRoot, ".env"), quiet: true });
  config({ path: join(repoRoot, "apps/worker/.env"), override: true, quiet: true });
}

/** Prints the paste instruction and exits when the service role key is empty. Never prints the key. */
export function requireServiceRole(): { url: string; key: string } {
  loadEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!key) {
    console.log(PASTE_SERVICE_ROLE);
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
  if (!url) {
    console.error("Missing SUPABASE_URL");
    process.exit(1);
  }
  return { url, key };
}
