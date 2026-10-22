import { checkEvidence, messageDelayMs } from "@community-bots/core";
import { createServiceClient, listDealsForRun } from "../db";
import { readableError } from "../errors";
import { requireServiceRole } from "../env";
import { loadSampleDeal } from "../sampleFixture";

const { url, key } = requireServiceRole();

let loaded: ReturnType<typeof loadSampleDeal>;
try {
  loaded = loadSampleDeal();
} catch (error) {
  console.error(`seed:sample ${readableError(error)}`);
  process.exit(1);
}
const { sample, deal, date } = loaded;

const db = createServiceClient(url, key);
const { run } = sample;
const cards = new Map(sample.communities.map((entry) => [entry.card.id, entry.card]));

async function step(what: string, request: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await request;
  if (error) {
    console.error(`seed:sample failed to ${what}: ${readableError(new Error(error.message))}`);
    process.exit(1);
  }
}

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
    { onConflict: "id" },
  ),
);
await step(
  "save the inbox tokens",
  db.from("community_secrets").upsert(
    sample.communities.map((entry) => ({ community_id: entry.card.id, inbox_token: entry.inboxToken })),
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
await step(
  "save the deal",
  db.from("deals").upsert({ id: sample.deal.id, run_id: run.id, round: 1, status: "pending_approval", deal }),
);
await step(
  "point the run at the deal",
  db.from("runs").update({
    deal_id: sample.deal.id,
    status: "pending_approval",
    round: 1,
    consensus: true,
    decline_reason: null,
    typing: null,
    error: null,
    control: "running",
    is_sample: true,
    backend: "mock",
  }).eq("id", run.id),
);
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

let dealIds: string[] = [];
try {
  dealIds = (await listDealsForRun(db, run.id)).map((row) => row.id);
} catch (error) {
  console.error(`seed:sample failed to list deals: ${readableError(error)}`);
  process.exit(1);
}
if (dealIds.length > 0) {
  await step("clear sample RSVPs", db.from("rsvps").delete().in("deal_id", dealIds));
  await step("clear sample Luma rows", db.from("luma_events").delete().in("deal_id", dealIds));
}
await step("drop later sample deals", db.from("deals").delete().eq("run_id", run.id).neq("id", sample.deal.id));
await step("clear the sample chat", db.from("messages").delete().eq("run_id", run.id));
await step(
  "save the sample chat",
  db.from("messages").insert(
    sample.messages.map((message, seq) => ({
      run_id: run.id,
      seq,
      speaker: message.speaker,
      community_id: message.communityId,
      role: message.role,
      text: message.text,
      stance: message.stance,
      evidence: message.quote ? checkEvidence(message.quote, cards.get(message.communityId)!) : null,
      delay_ms: messageDelayMs(message.text),
    })),
  ),
);
await step(
  "save the announcements",
  db.from("announcements").upsert(
    Object.entries(sample.announcements).map(([communityId, text]) => ({
      deal_id: sample.deal.id,
      community_id: communityId,
      text,
    })),
    { onConflict: "deal_id,community_id" },
  ),
);

console.log(`Loaded sample run ${run.id} on ${date}.`);
for (const entry of sample.communities) {
  const token = sample.approvalTokens[entry.card.id];
  console.log(`/r/${token}`);
  console.log(`/inbox/${entry.inboxToken}`);
}
