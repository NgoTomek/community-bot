import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type { Card, CommunityStatus, ExportedRun } from "@community-bots/core";
import { createServiceClient } from "../db";
import { readableError } from "../errors";
import { repoRoot, requireServiceRole } from "../env";

function argValue(flag: string, argv: string[]): string | undefined {
  const index = argv.indexOf(flag);
  if (index >= 0) return argv[index + 1];
  const prefix = `${flag}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const SECRET_KEYS = new Set(["token", "inbox_token", "passcode"]);

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEYS.has(key)) continue;
    out[key] = stripSecrets(child);
  }
  return out;
}

function usage(): never {
  console.error("Usage: tsx src/scripts/exportRun.ts --run <uuid> [--out apps/web/public/demo-run.json]");
  process.exit(1);
}

const runId = argValue("--run", process.argv.slice(2));
const outArg = argValue("--out", process.argv.slice(2));
if (!runId) usage();

const { url, key } = requireServiceRole();
const db = createServiceClient(url, key);

const runResult = await db.from("runs").select("*").eq("id", runId).maybeSingle();
if (runResult.error) {
  console.error(readableError(new Error(runResult.error.message)));
  process.exit(1);
}
if (!runResult.data) {
  console.error(`Run not found: ${runId}`);
  process.exit(1);
}

const run = runResult.data as {
  id: string;
  lead_id: string;
  partner_ids: unknown;
  deal_id: string | null;
};
const partnerIds = Array.isArray(run.partner_ids) ? run.partner_ids.filter((id): id is string => typeof id === "string") : [];
const communityIds = [run.lead_id, ...partnerIds];

const cards: ExportedRun["cards"] = {};
for (const id of communityIds) {
  const row = await db.from("communities").select("id,name,status,card").eq("id", id).maybeSingle();
  if (row.error) {
    console.error(readableError(new Error(row.error.message)));
    process.exit(1);
  }
  if (!row.data) continue;
  const community = row.data as { name: string; status: CommunityStatus; card: Card };
  cards[id] = { name: community.name, status: community.status, card: community.card };
}

const messagesResult = await db.from("messages").select("*").eq("run_id", run.id).order("seq", { ascending: true });
if (messagesResult.error) {
  console.error(readableError(new Error(messagesResult.error.message)));
  process.exit(1);
}

const dealResult = run.deal_id
  ? await db.from("deals").select("*").eq("id", run.deal_id).maybeSingle()
  : { data: null, error: null };
if (dealResult.error) {
  console.error(readableError(new Error(dealResult.error.message)));
  process.exit(1);
}

const dealId = (dealResult.data as { id?: string } | null)?.id ?? null;
const approvalsResult = dealId
  ? await db.from("approvals").select("*").eq("run_id", run.id)
  : { data: [], error: null };
if (approvalsResult.error) {
  console.error(readableError(new Error(approvalsResult.error.message)));
  process.exit(1);
}
const announcementsResult = dealId
  ? await db.from("announcements").select("*").eq("deal_id", dealId)
  : { data: [], error: null };
if (announcementsResult.error) {
  console.error(readableError(new Error(announcementsResult.error.message)));
  process.exit(1);
}

const exported = stripSecrets({
  version: 1,
  exportedAt: new Date().toISOString(),
  run: runResult.data,
  cards,
  messages: messagesResult.data ?? [],
  deal: dealResult.data,
  approvals: approvalsResult.data ?? [],
  announcements: announcementsResult.data ?? [],
}) as ExportedRun;

const outPath = outArg ? (isAbsolute(outArg) ? outArg : resolve(repoRoot, outArg)) : resolve(repoRoot, "apps/web/public/demo-run.json");
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(exported, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);
