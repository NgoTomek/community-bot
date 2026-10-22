// npm run export-demo -w @community-bots/web: writes public/demo-run.json (an ExportedRun, version 1)
// from the confirmed run of the mock's sample world. /demo replays that file. Everything in it is
// sample data from the mock backend, and the UI labels it so.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEAL_STATUSES,
  messageDelayMs,
  type AnnouncementRow,
  type ApprovalRow,
  type DealRow,
  type DealStatus,
  type ExportedRun,
  type MessageRow,
  type RunRow,
} from "@community-bots/core";
import { MockSource } from "../src/data/mock/mockSource";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../public/demo-run.json");
const MIN_DELAY_MS = 700;
const MAX_DELAY_MS = 4000;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const m = new MockSource({ storage: null });

function fail(message: string): never {
  console.error(`export-demo: ${message}`);
  m.dispose();
  process.exit(1);
}

const run = (await m.listRuns()).find((r) => r.status === "confirmed");
if (!run) fail("the sample world has no confirmed run");

const ids = [run.leadId, ...run.partnerIds];
const communities = await m.listCommunities();
const cards: ExportedRun["cards"] = {};
for (const id of ids) {
  const c = communities.find((x) => x.id === id);
  if (!c) fail(`community ${id} is missing from the sample world`);
  cards[id] = { name: c.name, status: c.status, card: c.card };
}

// The pause before each post is the real gap to the previous one, kept between 0.7 and 4 seconds.
const messages: MessageRow[] = (await m.listMessages(run.id)).map((msg, i, all) => {
  const gap = i > 0 ? Date.parse(msg.createdAt) - Date.parse(all[i - 1].createdAt) : Number.NaN;
  return {
    id: msg.id,
    run_id: run.id,
    seq: msg.seq,
    speaker: msg.speaker,
    community_id: msg.communityId,
    role: msg.role,
    text: msg.text,
    stance: msg.stance,
    evidence: msg.evidence,
    delay_ms: Number.isFinite(gap) ? clamp(gap, MIN_DELAY_MS, MAX_DELAY_MS) : messageDelayMs(msg.text),
    created_at: msg.createdAt,
  };
});

const deals = await m.listDeals(run.id);
const latest = deals[deals.length - 1] ?? null;
const deal: DealRow | null = latest
  ? {
      id: latest.id,
      run_id: run.id,
      deal: latest.deal,
      round: latest.round,
      status: (DEAL_STATUSES as readonly string[]).includes(latest.status) ? (latest.status as DealStatus) : "pending_approval",
      created_at: latest.createdAt,
    }
  : null;

// Approvals without tokens. A confirmed run means every organiser approved.
const approvals: Omit<ApprovalRow, "token">[] = [];
if (latest) {
  for (const row of await m.presenterStatus("export", run.id)) {
    const detail = await m.getRequest(row.token);
    if (detail.status !== "approved") fail(`${row.name} has not approved the confirmed run`);
    approvals.push({
      run_id: run.id,
      community_id: row.communityId,
      deal_id: detail.dealId,
      status: detail.status,
      note: detail.note,
      round: detail.round,
      quick_reasons: [],
      history: detail.history,
      updated_at: detail.history[detail.history.length - 1]?.at ?? latest.createdAt,
    });
  }
}

const announcements: AnnouncementRow[] = latest
  ? (await m.listAnnouncements(latest.id)).map((a) => ({ deal_id: a.dealId, community_id: a.communityId, text: a.text }))
  : [];

const runRow: RunRow = {
  id: run.id,
  lead_id: run.leadId,
  need: run.need,
  partner_ids: run.partnerIds,
  backend: "mock",
  status: run.status,
  consensus: run.consensus,
  deal_id: run.dealId,
  round: run.round,
  decline_reason: run.declineReason,
  typing: null,
  error: run.error,
  created_at: run.createdAt,
};

const exported: ExportedRun = {
  version: 1,
  exportedAt: new Date().toISOString(),
  run: runRow,
  cards,
  messages,
  deal,
  approvals,
  announcements,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(exported, null, 2)}\n`, "utf8");
console.log(`Wrote ${OUT}: ${messages.length} posts, ${deal ? `deal "${deal.deal.title}"` : "no deal"}, ${approvals.length} approvals.`);

m.dispose();
process.exit(0);
