// npm run demo:reset: puts every sample run (runs.is_sample, from npm run seed:sample) back to
// round 1 with pending approvals, keeping tokens. Real runs are never touched.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
config({ path: join(repoRoot, "apps/worker/.env"), quiet: true });
config({ path: join(repoRoot, ".env"), quiet: true });

const url = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceRoleKey) {
  console.error("demo:reset needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (apps/worker/.env or the root .env).");
  process.exit(1);
}

const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await client.rpc("reset_sample_runs");
if (error) {
  console.error(`demo:reset failed: ${error.message}`);
  process.exit(1);
}

const result = data as { runs: number; approvals: number; rsvps_removed: number };
console.log(
  `Reset ${result.runs} sample run(s): ${result.approvals} approval(s) back to pending in round 1, ` +
    `${result.rsvps_removed} RSVP(s) removed. Real runs were not touched.`,
);
