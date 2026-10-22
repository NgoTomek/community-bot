import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  CardSchema,
  type BackendName,
  type Card,
  type ChatMessage,
  type Deal,
  type Evidence,
  type Stance,
} from "@community-bots/core";

export function createServiceClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function raise(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

export function isDuplicate(error: { code?: string; message: string } | null): boolean {
  if (!error) return false;
  return error.code === "23505" || /duplicate key|unique constraint/i.test(error.message);
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export type CommunityRecord = {
  id: string;
  name: string;
  status: "draft" | "confirmed";
  card: Card;
  source_urls: string[];
};

export type RunRecord = {
  id: string;
  lead_id: string;
  need: string;
  partner_ids: string[];
  backend: BackendName;
  status: string;
  consensus: boolean | null;
  deal_id: string | null;
  round: number;
  decline_reason: string | null;
  typing: string | null;
  error: string | null;
  control: "running" | "paused" | "stopped";
};

export type ApprovalRecord = {
  run_id: string;
  community_id: string;
  deal_id: string;
  status: string;
  note: string | null;
  round: number;
};

export type MessageRecord = {
  id: string;
  run_id: string;
  seq: number;
  speaker: string;
  community_id: string;
  role: "human" | "bot";
  text: string;
  stance: Stance | null;
  evidence: Evidence | null;
  delay_ms: number;
};

export type DealRecord = {
  id: string;
  run_id: string;
  deal: unknown;
  round: number;
  status: string;
};

export type LumaRecord = {
  deal_id: string;
  luma_event_id: string | null;
  url: string | null;
};

const STANCES = new Set(["offer", "counter", "accept", "decline", "question"]);

function asStatus(value: unknown): "draft" | "confirmed" {
  return value === "confirmed" ? "confirmed" : "draft";
}

function asControl(value: unknown): RunRecord["control"] {
  if (value === "paused" || value === "stopped") return value;
  return "running";
}

function asBackend(value: unknown): BackendName {
  if (value === "grokbot" || value === "openai" || value === "mock") return value;
  return "mock";
}

function asStance(value: unknown): Stance | null {
  return typeof value === "string" && STANCES.has(value) ? (value as Stance) : null;
}

export function mapRun(data: unknown): RunRecord {
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    lead_id: String(row.lead_id ?? ""),
    need: String(row.need ?? ""),
    partner_ids: asStringArray(row.partner_ids),
    backend: asBackend(row.backend),
    status: String(row.status ?? ""),
    consensus: typeof row.consensus === "boolean" ? row.consensus : null,
    deal_id: typeof row.deal_id === "string" ? row.deal_id : null,
    round: typeof row.round === "number" && row.round >= 1 ? row.round : 1,
    decline_reason: typeof row.decline_reason === "string" ? row.decline_reason : null,
    typing: typeof row.typing === "string" ? row.typing : null,
    error: typeof row.error === "string" ? row.error : null,
    control: asControl(row.control),
  };
}

function mapCommunity(row: Record<string, unknown>): CommunityRecord | null {
  const card = CardSchema.safeParse(row.card);
  if (!card.success || typeof row.id !== "string") return null;
  return {
    id: row.id,
    name: typeof row.name === "string" ? row.name : card.data.name,
    status: asStatus(row.status),
    card: card.data,
    source_urls: asStringArray(row.source_urls),
  };
}

export async function setProgress(client: SupabaseClient, id: string, progress: string): Promise<void> {
  const { error } = await client.from("jobs").update({ progress }).eq("id", id);
  raise(error, "Failed to set job progress");
}

export async function loadCommunity(client: SupabaseClient, id: string): Promise<CommunityRecord | null> {
  const { data, error } = await client.from("communities").select("id,name,status,card,source_urls").eq("id", id).maybeSingle();
  raise(error, "Failed to load community");
  if (!data) return null;
  return mapCommunity(data as Record<string, unknown>);
}

export async function communityStatus(
  client: SupabaseClient,
  id: string,
): Promise<"draft" | "confirmed" | null> {
  const { data, error } = await client.from("communities").select("status").eq("id", id).maybeSingle();
  raise(error, "Failed to load community");
  if (!data) return null;
  return asStatus((data as { status?: unknown }).status);
}

export async function listCommunities(client: SupabaseClient): Promise<CommunityRecord[]> {
  const { data, error } = await client.from("communities").select("id,name,status,card,source_urls").order("name");
  raise(error, "Failed to list communities");
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.flatMap((row) => {
    const community = mapCommunity(row);
    return community ? [community] : [];
  });
}

/** Inserts an inbox token only when the community has none. Never updates an existing token. */
export async function ensureInbox(client: SupabaseClient, communityId: string): Promise<void> {
  const { data, error } = await client
    .from("community_secrets")
    .select("community_id")
    .eq("community_id", communityId)
    .maybeSingle();
  raise(error, "Failed to read community secrets");
  if (data) return;
  const inserted = await client.from("community_secrets").insert({ community_id: communityId });
  if (inserted.error && !isDuplicate(inserted.error)) raise(inserted.error, "Failed to create inbox");
}

/**
 * Writes a draft card. A confirmed card is left untouched, including its inbox token.
 * Returns the card that is stored after the call.
 */
export async function upsertDraftCommunity(client: SupabaseClient, card: Card): Promise<Card> {
  const { data, error } = await client
    .from("communities")
    .select("id,name,status,card,source_urls")
    .eq("id", card.id)
    .maybeSingle();
  raise(error, "Failed to load community");
  if (data && asStatus((data as { status?: unknown }).status) === "confirmed") {
    await ensureInbox(client, card.id);
    const stored = mapCommunity(data as Record<string, unknown>);
    if (!stored) throw new Error(`Confirmed community ${card.id} has a card that could not be read`);
    return stored.card;
  }
  const { error: writeError } = await client.from("communities").upsert(
    {
      id: card.id,
      name: card.name,
      status: "draft",
      card,
      source_urls: card.sourceUrls,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  raise(writeError, "Failed to save community");
  await ensureInbox(client, card.id);
  return card;
}

export async function loadRun(client: SupabaseClient, id: string): Promise<RunRecord | null> {
  const { data, error } = await client.from("runs").select("*").eq("id", id).maybeSingle();
  raise(error, "Failed to load run");
  if (!data) return null;
  return mapRun(data);
}

export async function listPendingRuns(client: SupabaseClient): Promise<RunRecord[]> {
  const { data, error } = await client.from("runs").select("*").eq("status", "pending_approval");
  raise(error, "Failed to list runs awaiting approval");
  return ((data ?? []) as unknown[]).map(mapRun);
}

export async function insertRun(
  client: SupabaseClient,
  row: { id?: string; lead_id: string; need: string; partner_ids: string[]; backend: BackendName; round: number },
): Promise<RunRecord> {
  const payload: Record<string, unknown> = {
    lead_id: row.lead_id,
    need: row.need,
    partner_ids: row.partner_ids,
    backend: row.backend,
    status: "negotiating",
    round: row.round,
    control: "running",
  };
  if (row.id) payload.id = row.id;
  const { data, error } = await client.from("runs").insert(payload).select("*").single();
  raise(error, "Failed to create run");
  if (!data) throw new Error("Failed to create run");
  return mapRun(data);
}

/** Compare-and-set. True only when a row in one of `statusIn` was updated. */
export async function updateRunWhere(
  client: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
  statusIn: string[],
): Promise<boolean> {
  const { data, error } = await client.from("runs").update(patch).eq("id", id).in("status", statusIn).select("id");
  raise(error, "Failed to update run");
  return Array.isArray(data) && data.length > 0;
}

export async function insertMessage(client: SupabaseClient, runId: string, message: ChatMessage): Promise<string> {
  const { data, error } = await client
    .from("messages")
    .insert({
      run_id: runId,
      seq: message.seq,
      speaker: message.speaker,
      community_id: message.communityId,
      role: message.role,
      text: message.text,
      stance: message.stance,
      evidence: message.evidence,
      delay_ms: message.delayMs,
      as_community: null,
    })
    .select("id")
    .single();
  raise(error, "Failed to insert message");
  const id = (data as { id?: string } | null)?.id;
  if (!id) throw new Error("Failed to insert message");
  return id;
}

export async function listMessages(client: SupabaseClient, runId: string): Promise<MessageRecord[]> {
  const { data, error } = await client.from("messages").select("*").eq("run_id", runId).order("seq", { ascending: true });
  raise(error, "Failed to load messages");
  return ((data ?? []) as Record<string, unknown>[]).flatMap((row) => {
    const role = row.role === "human" || row.role === "bot" ? row.role : null;
    if (!role || typeof row.id !== "string") return [];
    return [
      {
        id: row.id,
        run_id: runId,
        seq: typeof row.seq === "number" ? row.seq : 0,
        speaker: typeof row.speaker === "string" ? row.speaker : "",
        community_id: typeof row.community_id === "string" ? row.community_id : "",
        role,
        text: typeof row.text === "string" ? row.text : "",
        stance: asStance(row.stance),
        evidence: (row.evidence as Evidence | null) ?? null,
        delay_ms: typeof row.delay_ms === "number" ? row.delay_ms : 0,
      },
    ];
  });
}

export async function insertDeal(client: SupabaseClient, row: { runId: string; deal: Deal; round: number }): Promise<string> {
  const { data, error } = await client
    .from("deals")
    .insert({ run_id: row.runId, deal: row.deal, round: row.round, status: "pending_approval" })
    .select("id")
    .single();
  raise(error, "Failed to insert deal");
  const id = (data as { id?: string } | null)?.id;
  if (!id) throw new Error("Failed to insert deal");
  return id;
}

export async function loadDeal(client: SupabaseClient, id: string): Promise<DealRecord | null> {
  const { data, error } = await client.from("deals").select("id,run_id,deal,round,status").eq("id", id).maybeSingle();
  raise(error, "Failed to load deal");
  if (!data) return null;
  const row = data as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.run_id !== "string") return null;
  return {
    id: row.id,
    run_id: row.run_id,
    deal: row.deal,
    round: typeof row.round === "number" ? row.round : 1,
    status: typeof row.status === "string" ? row.status : "pending_approval",
  };
}

export async function listDealsForRun(client: SupabaseClient, runId: string): Promise<{ id: string }[]> {
  const { data, error } = await client.from("deals").select("id").eq("run_id", runId);
  raise(error, "Failed to list deals");
  return ((data ?? []) as { id?: string }[]).flatMap((row) => (row.id ? [{ id: row.id }] : []));
}

export async function listAnnouncements(client: SupabaseClient, dealId: string): Promise<{ community_id: string; text: string }[]> {
  const { data, error } = await client.from("announcements").select("community_id,text").eq("deal_id", dealId);
  raise(error, "Failed to load announcements");
  return ((data ?? []) as { community_id?: string; text?: string }[]).flatMap((row) =>
    row.community_id && row.text ? [{ community_id: row.community_id, text: row.text }] : [],
  );
}

export async function upsertAnnouncements(
  client: SupabaseClient,
  dealId: string,
  items: { communityId: string; text: string }[],
): Promise<void> {
  if (items.length === 0) return;
  const { error } = await client.from("announcements").upsert(
    items.map((item) => ({ deal_id: dealId, community_id: item.communityId, text: item.text })),
    { onConflict: "deal_id,community_id" },
  );
  raise(error, "Failed to save announcements");
}

export async function insertApprovals(client: SupabaseClient, runId: string, dealId: string, communityIds: string[], round: number): Promise<void> {
  const ids = [...new Set(communityIds)];
  if (ids.length === 0) return;
  const { error } = await client.from("approvals").insert(
    ids.map((community_id) => ({
      run_id: runId,
      community_id,
      deal_id: dealId,
      status: "pending",
      round,
    })),
  );
  raise(error, "Failed to create approvals");
}

export async function listApprovals(client: SupabaseClient, runId: string): Promise<ApprovalRecord[]> {
  const { data, error } = await client
    .from("approvals")
    .select("run_id,community_id,deal_id,status,note,round")
    .eq("run_id", runId);
  raise(error, "Failed to load approvals");
  return ((data ?? []) as Record<string, unknown>[]).flatMap((row) => {
    if (typeof row.community_id !== "string" || typeof row.deal_id !== "string") return [];
    return [
      {
        run_id: runId,
        community_id: row.community_id,
        deal_id: row.deal_id,
        status: typeof row.status === "string" ? row.status : "pending",
        note: typeof row.note === "string" ? row.note : null,
        round: typeof row.round === "number" ? row.round : 1,
      },
    ];
  });
}

/** Points every approval at the new deal. Does not change token, history, or quick_reasons. */
export async function retargetApprovals(client: SupabaseClient, runId: string, dealId: string, round: number): Promise<void> {
  const approvals = await listApprovals(client, runId);
  for (const approval of approvals) {
    const { error } = await client
      .from("approvals")
      .update({
        deal_id: dealId,
        status: "pending",
        round,
        note: null,
        updated_at: new Date().toISOString(),
      })
      .eq("run_id", runId)
      .eq("community_id", approval.community_id);
    raise(error, "Failed to update approval");
  }
}

export async function loadLuma(client: SupabaseClient, dealId: string): Promise<LumaRecord | null> {
  const { data, error } = await client.from("luma_events").select("deal_id,luma_event_id,url").eq("deal_id", dealId).maybeSingle();
  raise(error, "Failed to load Luma event");
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    deal_id: dealId,
    luma_event_id: typeof row.luma_event_id === "string" ? row.luma_event_id : null,
    url: typeof row.url === "string" ? row.url : null,
  };
}

export async function insertLumaIfAbsent(client: SupabaseClient, dealId: string): Promise<void> {
  const { error } = await client.from("luma_events").insert({ deal_id: dealId });
  if (error && !isDuplicate(error)) raise(error, "Failed to record the export");
}

export async function markRunError(client: SupabaseClient, id: string, message: string): Promise<void> {
  await updateRunWhere(client, id, { status: "error", error: message, typing: null }, [
    "pending_approval",
    "negotiating",
    "compiling",
    "matching",
  ]);
}
