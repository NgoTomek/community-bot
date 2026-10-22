import { CardSchema, type Card } from "@community-bots/core";
import { requireSupabase } from "./supabase";

/**
 * Browser data access.
 * Never select approvals, community_secrets, settings, rsvps, or luma_events.
 * Realtime is limited to messages, runs, jobs, and deals (see useLive).
 */
const COMMUNITY_COLUMNS = "id,name,status,card,source_urls,updated_at";
const RUN_COLUMNS =
  "id,lead_id,need,partner_ids,backend,status,consensus,deal_id,round,decline_reason,typing,error,created_at";
const MESSAGE_COLUMNS =
  "id,run_id,seq,speaker,community_id,role,text,stance,evidence,delay_ms,created_at";
const DEAL_COLUMNS = "id,run_id,deal,round,status,created_at";
const ANNOUNCEMENT_COLUMNS = "deal_id,community_id,text";
const JOB_COLUMNS = "id,type,params,status,progress,result,error,created_at,claimed_at";

export type WebJobType = "draft_card" | "match" | "negotiate" | "renegotiate" | "publish_luma";

export interface PublicCommunity {
  id: string;
  name: string;
  status: string;
  card: Card | null;
  sourceUrls: string[];
  updatedAt: string;
}

export interface RunView {
  id: string;
  leadId: string;
  need: string;
  partnerIds: string[];
  backend: string | null;
  status: string;
  consensus: boolean | null;
  dealId: string | null;
  round: number | null;
  declineReason: string | null;
  typing: string | null;
  error: string | null;
  createdAt: string;
}

export interface LiveMessage {
  id: string;
  seq: number;
  speaker: string;
  communityId: string;
  role: "human" | "bot";
  text: string;
  stance: string | null;
  evidence: unknown;
  delayMs: number;
}

export interface DealView {
  id: string;
  runId: string;
  round: number | null;
  deal: unknown;
  status: string;
  createdAt: string;
}

export interface AnnouncementView {
  communityId: string;
  text: string;
}

export interface JobView {
  id: string;
  type: string;
  params: unknown;
  status: string;
  progress: string | null;
  result: unknown;
  error: string | null;
  createdAt: string;
  claimedAt: string | null;
}

export interface PresenterStatus {
  communityId: string;
  name: string;
  status: string;
  round: number | null;
  note: string | null;
  token: string;
  inboxToken: string;
}

export interface EventView {
  dealId: string;
  deal: unknown;
  backend: string | null;
  communities: { id: string; name: string; status: string | null }[];
  announcements: AnnouncementView[];
  rsvpCount: number;
  allApproved: boolean;
}

function unwrap(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  const next = unwrap(value);
  if (!next || typeof next !== "object" || Array.isArray(next)) return null;
  return next as Record<string, unknown>;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  const next = unwrap(value);
  if (!Array.isArray(next)) return [];
  return next.flatMap((item) => {
    const record = asRecord(item);
    return record ? [record] : [];
  });
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function read(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<unknown> {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await requireSupabase().rpc(fn, args);
  if (result.error) throw result.error;
  return unwrap(result.data);
}

function toCommunity(value: Record<string, unknown>): PublicCommunity | null {
  const id = text(value.id);
  if (!id) return null;
  const parsed = CardSchema.safeParse(value.card);
  const card = parsed.success ? parsed.data : null;
  const sourceUrls = [...new Set([...stringList(value.source_urls), ...(card?.sourceUrls ?? [])])];
  return {
    id,
    name: text(value.name)?.trim() || card?.name || id,
    status: text(value.status) || "draft",
    card,
    sourceUrls,
    updatedAt: text(value.updated_at) ?? "",
  };
}

function toRun(value: Record<string, unknown>): RunView | null {
  const id = text(value.id);
  if (!id) return null;
  const typing = text(value.typing);
  return {
    id,
    leadId: text(value.lead_id) ?? "",
    need: text(value.need) ?? "",
    partnerIds: stringList(value.partner_ids),
    backend: text(value.backend),
    status: text(value.status) ?? "",
    consensus: typeof value.consensus === "boolean" ? value.consensus : null,
    dealId: text(value.deal_id),
    round: typeof value.round === "number" ? value.round : null,
    declineReason: text(value.decline_reason),
    typing: typing && typing.trim() ? typing : null,
    error: text(value.error),
    createdAt: text(value.created_at) ?? "",
  };
}

export function toMessage(value: Record<string, unknown>, index = 0): LiveMessage | null {
  const body = text(value.text);
  if (body === null) return null;
  const evidence = typeof value.evidence === "string" ? unwrap(value.evidence) : (value.evidence ?? null);
  return {
    id: text(value.id) ?? `m-${index}`,
    seq: typeof value.seq === "number" ? value.seq : index,
    speaker: text(value.speaker) ?? "",
    communityId: text(value.community_id) ?? "",
    role: value.role === "bot" ? "bot" : "human",
    text: body,
    stance: text(value.stance),
    evidence,
    delayMs: typeof value.delay_ms === "number" && Number.isFinite(value.delay_ms) ? value.delay_ms : 0,
  };
}

function toDeal(value: Record<string, unknown>): DealView | null {
  const id = text(value.id);
  if (!id) return null;
  return {
    id,
    runId: text(value.run_id) ?? "",
    round: typeof value.round === "number" ? value.round : null,
    deal: value.deal,
    status: text(value.status) ?? "",
    createdAt: text(value.created_at) ?? "",
  };
}

function toJob(value: Record<string, unknown>): JobView | null {
  const id = text(value.id);
  if (!id) return null;
  return {
    id,
    type: text(value.type) ?? "",
    params: value.params ?? null,
    status: text(value.status) ?? "",
    progress: text(value.progress),
    result: value.result ?? null,
    error: text(value.error),
    createdAt: text(value.created_at) ?? "",
    claimedAt: text(value.claimed_at),
  };
}

export async function listCommunities(): Promise<PublicCommunity[]> {
  const data = await read(
    requireSupabase().from("communities_public").select(COMMUNITY_COLUMNS).order("updated_at", { ascending: false }),
  );
  return asRecords(data).flatMap((row) => {
    const community = toCommunity(row);
    return community ? [community] : [];
  });
}

export async function getCommunity(id: string): Promise<PublicCommunity | null> {
  const data = await read(
    requireSupabase().from("communities_public").select(COMMUNITY_COLUMNS).eq("id", id).maybeSingle(),
  );
  const record = asRecord(data);
  return record ? toCommunity(record) : null;
}

export async function getCommunities(ids: string[]): Promise<PublicCommunity[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const data = await read(requireSupabase().from("communities_public").select(COMMUNITY_COLUMNS).in("id", unique));
  return asRecords(data).flatMap((row) => {
    const community = toCommunity(row);
    return community ? [community] : [];
  });
}

export async function getRun(id: string): Promise<RunView | null> {
  const data = await read(requireSupabase().from("runs").select(RUN_COLUMNS).eq("id", id).maybeSingle());
  const record = asRecord(data);
  return record ? toRun(record) : null;
}

export async function listMessages(runId: string): Promise<LiveMessage[]> {
  const data = await read(
    requireSupabase().from("messages").select(MESSAGE_COLUMNS).eq("run_id", runId).order("seq", { ascending: true }),
  );
  return asRecords(data).flatMap((row, index) => {
    const message = toMessage(row, index);
    return message ? [message] : [];
  });
}

export async function listDeals(runId: string): Promise<DealView[]> {
  const data = await read(
    requireSupabase().from("deals").select(DEAL_COLUMNS).eq("run_id", runId).order("created_at", { ascending: true }),
  );
  return asRecords(data).flatMap((row) => {
    const deal = toDeal(row);
    return deal ? [deal] : [];
  });
}

export async function listAnnouncements(dealId: string): Promise<AnnouncementView[]> {
  const data = await read(
    requireSupabase().from("announcements").select(ANNOUNCEMENT_COLUMNS).eq("deal_id", dealId),
  );
  return asRecords(data).flatMap((row) => {
    const communityId = text(row.community_id);
    const body = text(row.text);
    if (!communityId || body === null) return [];
    return [{ communityId, text: body }];
  });
}

export async function getJob(id: string): Promise<JobView | null> {
  const data = await read(requireSupabase().from("jobs").select(JOB_COLUMNS).eq("id", id).maybeSingle());
  const record = asRecord(data);
  return record ? toJob(record) : null;
}

export async function submitJob(passcode: string, type: WebJobType, params: Record<string, unknown>): Promise<string> {
  const data = await rpc("submit_job", { p_passcode: passcode, p_type: type, p_params: params });
  if (typeof data !== "string" || !data) throw new Error("The backend did not return a job id");
  return data;
}

export async function saveCard(passcode: string, card: Card, status: "draft" | "confirmed"): Promise<string> {
  const data = await rpc("save_card", { p_passcode: passcode, p_card: card, p_status: status });
  return typeof data === "string" && data ? data : card.id;
}

export async function getEvent(dealId: string): Promise<EventView> {
  const data = await rpc("get_event", { p_deal_id: dealId });
  const row = asRecord(data);
  if (!row) throw new Error("Event response was empty");
  return {
    dealId: text(row.deal_id) ?? dealId,
    deal: row.deal,
    backend: text(row.backend),
    communities: asRecords(row.communities).flatMap((community) => {
      const id = text(community.id);
      if (!id) return [];
      const status = community.status === "confirmed" || community.status === "draft" ? community.status : null;
      return [{ id, name: text(community.name)?.trim() || id, status }];
    }),
    announcements: asRecords(row.announcements).flatMap((announcement) => {
      const communityId = text(announcement.community_id);
      const body = text(announcement.text);
      if (!communityId || body === null) return [];
      return [{ communityId, text: body }];
    }),
    rsvpCount: typeof row.rsvp_count === "number" ? row.rsvp_count : 0,
    allApproved: row.all_approved === true,
  };
}

export async function rsvp(dealId: string, name: string): Promise<void> {
  await rpc("rsvp", { p_deal_id: dealId, p_name: name });
}

export async function presenterStatus(passcode: string, runId: string): Promise<PresenterStatus[]> {
  const data = await rpc("presenter_status", { p_passcode: passcode, p_run_id: runId });
  return asRecords(data).flatMap((row) => {
    const communityId = text(row.community_id);
    if (!communityId) return [];
    return [
      {
        communityId,
        name: text(row.name)?.trim() || communityId,
        status: text(row.status) ?? "pending",
        round: typeof row.round === "number" ? row.round : null,
        note: text(row.note),
        token: text(row.token) ?? "",
        inboxToken: text(row.inbox_token) ?? "",
      },
    ];
  });
}

export function jobHeadline(job: JobView): string {
  if (job.status === "error") return job.error || "The job failed";
  if (job.status === "done") return "Done";
  if (job.status === "running") return job.progress?.trim() || "Running";
  if (job.status === "queued") return "Queued";
  return job.progress?.trim() || job.status || "Working";
}
