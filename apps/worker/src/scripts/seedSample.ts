// npm run seed:sample: loads the fixed mock sample run from supabase/seed/sample.json (see
// docs/SAMPLE.md) with runs.is_sample = true, so npm run demo:reset can put it back later.
// Re-running it restores the sample: round 1, approvals pending, fixed tokens, no RSVPs.
import {
  addDays,
  allowedDaysForAll,
  checkEvidence,
  messageDelayMs,
  nextAllowedDate,
  todayIso,
  type Card,
  type Deal,
  type Stance,
} from "@community-bots/core";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Sample = {
  communities: { inboxToken: string; card: Card }[];
  run: { id: string; leadId: string; partnerIds: string[]; need: string };
  deal: { id: string; terms: Omit<Deal, "date"> };
  approvalTokens: Record<string, string>;
  messages: { speaker: string; communityId: string; role: "human" | "bot"; text: string; stance: Stance | null; quote: string | null }[];
  announcements: Record<string, string>;
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
config({ path: join(repoRoot, "apps/worker/.env"), quiet: true });
config({ path: join(repoRoot, ".env"), quiet: true });

const url = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceRoleKey) {
  console.error("seed:sample needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (apps/worker/.env or the root .env).");
  process.exit(1);
}

const sample = JSON.parse(readFileSync(join(repoRoot, "supabase/seed/sample.json"), "utf8")) as Sample;
const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const cards = new Map(sample.communities.map((c) => [c.card.id, c.card]));

async function step(what: string, request: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await request;
  if (error) {
    console.error(`seed:sample failed to ${what}: ${error.message}`);
    process.exit(1);
  }
}

// The first day every community allows, at least 14 days from today (system clock).
const allowed = allowedDaysForAll(sample.communities.map((c) => c.card.constraints.days));
const date = nextAllowedDate(addDays(todayIso(), 14), allowed);
if (!date) {
  console.error("seed:sample: the sample communities share no weekday.");
  process.exit(1);
}
const deal: Deal = { ...sample.deal.terms, date };
const { run } = sample;

await step(
  "save the communities",
  db.from("communities").upsert(
    sample.communities.map(({ card }) => ({
      id: card.id,
      name: card.name,
      status: "confirmed",
      card,
      source_urls: card.sourceUrls,
      updated_at: new Date().toISOString(),
    })),
  ),
);
await step(
  "save the inbox tokens",
  db.from("community_secrets").upsert(
    sample.communities.map((c) => ({ community_id: c.card.id, inbox_token: c.inboxToken })),
    { onConflict: "community_id" },
  ),
);
await step(
  "save the run",
  db.from("runs").upsert({
    id: run.id,
    lead_id: run.leadId,
    need: run.need,
    partner_ids: run.partnerIds,
    backend: "mock",
    status: "pending_approval",
    consensus: true,
    round: 1,
    decline_reason: null,
    typing: null,
    error: null,
    control: "running",
    is_sample: true,
  }),
);
await step("save the deal", db.from("deals").upsert({ id: sample.deal.id, run_id: run.id, round: 1, status: "pending_approval", deal }));
await step("point the run at the deal", db.from("runs").update({ deal_id: sample.deal.id }).eq("id", run.id));
await step(
  "save the approvals",
  db.from("approvals").upsert(
    Object.entries(sample.approvalTokens).map(([communityId, token]) => ({
      run_id: run.id,
      community_id: communityId,
      deal_id: sample.deal.id,
      token,
      status: "pending",
      note: null,
      round: 1,
      history: [],
      quick_reasons: [],
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "run_id,community_id" },
  ),
);
await step("clear the sample chat", db.from("messages").delete().eq("run_id", run.id));
await step(
  "save the sample chat",
  db.from("messages").insert(
    sample.messages.map((m, seq) => ({
      run_id: run.id,
      seq,
      speaker: m.speaker,
      community_id: m.communityId,
      role: m.role,
      text: m.text,
      stance: m.stance,
      evidence: m.quote ? checkEvidence(m.quote, cards.get(m.communityId)!) : null,
      delay_ms: messageDelayMs(m.text),
    })),
  ),
);
await step(
  "save the announcements",
  db.from("announcements").upsert(
    Object.entries(sample.announcements).map(([communityId, text]) => ({ deal_id: sample.deal.id, community_id: communityId, text })),
    { onConflict: "deal_id,community_id" },
  ),
);
await step("remove sample RSVPs", db.from("rsvps").delete().eq("deal_id", sample.deal.id));

console.log(`Loaded sample run ${run.id} (is_sample) with deal ${sample.deal.id} on ${date}.`);
for (const { card, inboxToken } of sample.communities) {
  console.log(`  ${card.name.padEnd(14)} /r/${sample.approvalTokens[card.id]}  /inbox/${inboxToken}`);
}
