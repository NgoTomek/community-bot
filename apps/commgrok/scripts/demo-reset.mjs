// Wipe and re-seed the demo data through the running app (POST /api/demo/reset).
// Works in local mode (.data/db.json) and Supabase mode (the server re-seeds the tables).
// Usage: npm run demo:reset   (reads PROPOSALS_API_KEY / SITE from env or .env.local)
import fs from "node:fs";

const env = {};
try {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
} catch {}
const key = process.env.PROPOSALS_API_KEY || env.PROPOSALS_API_KEY || "dev-secret";
const site = process.env.SITE || env.SITE || "http://localhost:3000";

try {
  const res = await fetch(`${site}/api/demo/reset`, { method: "POST", headers: { "X-API-Key": key } });
  console.log(res.status, await res.text());
  if (!res.ok) process.exitCode = 1;
} catch (e) {
  console.error(`Couldn't reach ${site}. Is the app running (npm run dev)?`, e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
