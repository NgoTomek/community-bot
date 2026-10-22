import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { BackendName, Card, Deal, Evidence, RunStatus, Stance } from "@community-bots/core";
import {
  DataError,
  RPC_NAMES,
  type Announcement,
  type ApprovalHistoryEntry,
  type ApprovalStatus,
  type Community,
  type DataSource,
  type DealVersion,
  type Decision,
  type EventInfo,
  type Job,
  type JobKind,
  type Message,
  type PresenterRow,
  type RequestDetail,
  type RequestSummary,
  type RpcName,
  type RpcState,
  type Run,
  type RunAction,
  type Topic,
} from "../types";

/* Rows come from the network: read every field defensively. */
type Row = Record<string, unknown>;

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const JOB_COLUMNS = "id,type,params,status,progress,result,error,created_at";
const REALTIME_TABLES = ["messages", "runs", "jobs", "deals"] as const;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function toCommunity(row: Row): Community {
  const card = row.card as Card;
  return {
    id: String(row.id),
    name: str(row.name) ?? card?.name ?? String(row.id),
    status: row.status === "confirmed" ? "confirmed" : "draft",
    card,
    sourceUrls: arr<string>(row.source_urls),
    updatedAt: str(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function toRun(row: Row): Run {
  const control = row.control === "paused" || row.control === "stopped" ? row.control : row.paused === true ? "paused" : row.stopped === true ? "stopped" : "running";
  return {
    id: String(row.id),
    leadId: String(row.lead_id ?? ""),
    need: str(row.need) ?? "",
    partnerIds: arr<string>(row.partner_ids),
    backend: (str(row.backend) ?? "mock") as BackendName,
    status: (str(row.status) ?? "negotiating") as RunStatus,
    consensus: typeof row.consensus === "boolean" ? row.consensus : null,
    dealId: str(row.deal_id),
    round: num(row.round, 1),
    declineReason: str(row.decline_reason),
    typing: str(row.typing),
    error: str(row.error),
    control,
    createdAt: str(row.created_at) ?? new Date(0).toISOString(),
  };
}

function toMessage(row: Row): Message {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    seq: num(row.seq, 0),
    speaker: str(row.speaker) ?? "",
    communityId: str(row.community_id) ?? "",
    role: row.role === "bot" ? "bot" : "human",
    text: str(row.text) ?? "",
    stance: (str(row.stance) as Stance | null) ?? null,
    evidence: (row.evidence as Evidence | null) ?? null,
    createdAt: str(row.created_at) ?? new Date(0).toISOString(),
  };
}

function toDeal(row: Row): DealVersion {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    round: num(row.round, 1),
    deal: row.deal as Deal,
    status: str(row.status) ?? "pending_approval",
    createdAt: str(row.created_at) ?? new Date(0).toISOString(),
  };
}

function toJob(row: Row): Job {
  return {
    id: String(row.id),
    type: str(row.type) ?? "",
    params: row.params,
    status: (str(row.status) ?? "queued") as Job["status"],
    progress: str(row.progress),
    result: row.result ?? null,
    error: str(row.error),
    createdAt: str(row.created_at) ?? new Date(0).toISOString(),
  };
}

const toStatus = (v: unknown): ApprovalStatus =>
  v === "approved" || v === "declined" || v === "renegotiate" ? v : v === "changes_requested" ? "renegotiate" : "pending";

function toHistory(v: unknown): ApprovalHistoryEntry[] {
  return arr<Row>(v).map((h) => ({
    round: num(h.round, 1),
    decision: toStatus(h.decision),
    note: str(h.note),
    at: str(h.at) ?? new Date(0).toISOString(),
  }));
}

interface PgError {
  code?: string;
  message: string;
}

export class SupabaseSource implements DataSource {
  readonly kind = "supabase" as const;
  readonly needsPasscode = true;

  private client: SupabaseClient;
  private listeners = new Map<Topic, Set<() => void>>();
  private channel: RealtimeChannel | null = null;
  private healthy = false;
  private rpc = new Map<RpcName, RpcState>(RPC_NAMES.map((n) => [n, "unknown"]));
  private capListeners = new Set<() => void>();
  private probing: Promise<void> | null = null;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  // -------------------------------------------------------------------------
  // Errors and capabilities
  // -------------------------------------------------------------------------

  private mark(name: RpcName, state: RpcState) {
    if (this.rpc.get(name) === state) return;
    this.rpc.set(name, state);
    this.capListeners.forEach((l) => l());
  }

  private fail(error: PgError, rpc?: RpcName): DataError {
    const message = error.message ?? "Something went wrong";
    if (error.code === "PGRST202" || /could not find the function/i.test(message)) {
      if (rpc) this.mark(rpc, "missing");
      return new DataError("not_ready", "backend not ready: this needs a newer database migration");
    }
    if (error.code === "PGRST205" || error.code === "42P01" || /could not find the table|does not exist/i.test(message)) {
      return new DataError("not_ready", "backend not ready: a table or view is missing");
    }
    if (rpc) this.mark(rpc, "ready");
    if (error.code === "42501" || /passcode/i.test(message)) return new DataError("wrong_passcode", "Wrong passcode");
    if (error.code === "P0002") return new DataError("not_found", message);
    if (error.code === "54000") return new DataError("conflict", message);
    if (/failed to fetch|network|fetch failed|load failed/i.test(message)) {
      return new DataError("network", "Can't reach the backend. Check your connection and try again.");
    }
    return new DataError("invalid", message);
  }

  private async call<T>(name: RpcName, args: Record<string, unknown>): Promise<T> {
    if (this.rpc.get(name) === "missing") throw new DataError("not_ready", "backend not ready");
    let result;
    try {
      result = await this.client.rpc(name, args);
    } catch (error) {
      throw this.fail({ message: error instanceof Error ? error.message : "network error" });
    }
    if (result.error) throw this.fail(result.error, name);
    this.mark(name, "ready");
    return result.data as T;
  }

  rpcState(name: RpcName): RpcState {
    return this.rpc.get(name) ?? "unknown";
  }

  onCapabilities(listener: () => void): () => void {
    this.capListeners.add(listener);
    return () => this.capListeners.delete(listener);
  }

  /** Calls each RPC with arguments that can only fail (zero uuid, empty passcode), so nothing is written. */
  probe(): Promise<void> {
    if (this.probing) return this.probing;
    const probes: [RpcName, Record<string, unknown>][] = [
      ["list_requests", { p_inbox: ZERO_UUID }],
      ["get_request", { p_token: ZERO_UUID }],
      ["respond", { p_token: ZERO_UUID, p_decision: "approved", p_note: null, p_quick: [] }],
      ["presenter_status", { p_passcode: "", p_run_id: ZERO_UUID }],
      ["submit_job", { p_passcode: "", p_type: "draft_card", p_params: {} }],
      ["save_card", { p_passcode: "", p_card: {}, p_status: "draft" }],
      ["get_event", { p_deal_id: ZERO_UUID }],
      ["rsvp", { p_deal_id: ZERO_UUID, p_name: "probe" }],
      ["post_message", { p_passcode: "", p_run_id: ZERO_UUID, p_text: "", p_as_community: null }],
      ["set_run_control", { p_passcode: "", p_run_id: ZERO_UUID, p_action: "pause" }],
    ];
    this.probing = Promise.all(
      probes.map(async ([name, args]) => {
        try {
          const { error } = await this.client.rpc(name, args);
          if (!error) this.mark(name, "ready");
          else this.fail(error, name);
        } catch {
          /* offline: stays unknown */
        }
      }),
    ).then(() => undefined);
    return this.probing;
  }

  setViewer(): void {}

  sampleIdentity() {
    return null;
  }

  // -------------------------------------------------------------------------
  // Realtime
  // -------------------------------------------------------------------------

  private ensureChannel() {
    if (this.channel) return;
    let channel = this.client.channel("community-bots-web");
    for (const table of REALTIME_TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        const row = ((payload.new && Object.keys(payload.new).length ? payload.new : payload.old) ?? {}) as Row;
        this.dispatch(this.topicsFor(table, row));
      });
    }
    this.channel = channel.subscribe((status) => {
      this.healthy = status === "SUBSCRIBED";
    });
  }

  private topicsFor(table: (typeof REALTIME_TABLES)[number], row: Row): Topic[] {
    switch (table) {
      case "messages":
        return [`messages:${row.run_id}`, "runs"];
      case "runs":
        return [`run:${row.id}`, "runs"];
      case "jobs":
        return [`job:${row.id}`];
      case "deals":
        return [`deals:${row.run_id}`, `event:${row.id}`, `run:${row.run_id}`, "runs"];
    }
  }

  private dispatch(topics: Topic[]) {
    const fire = new Set<() => void>();
    for (const t of topics) this.listeners.get(t)?.forEach((cb) => fire.add(cb));
    fire.forEach((cb) => cb());
  }

  subscribe(topics: Topic[], onChange: () => void): () => void {
    this.ensureChannel();
    for (const topic of topics) {
      if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
      this.listeners.get(topic)!.add(onChange);
    }
    return () => {
      for (const topic of topics) this.listeners.get(topic)?.delete(onChange);
    };
  }

  realtimeHealthy(): boolean {
    return this.healthy;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  private async rows(query: PromiseLike<{ data: unknown; error: PgError | null }>): Promise<Row[]> {
    let result;
    try {
      result = await query;
    } catch (error) {
      throw this.fail({ message: error instanceof Error ? error.message : "network error" });
    }
    if (result.error) throw this.fail(result.error);
    return arr<Row>(result.data);
  }

  private async one(query: PromiseLike<{ data: unknown; error: PgError | null }>): Promise<Row | null> {
    let result;
    try {
      result = await query;
    } catch (error) {
      throw this.fail({ message: error instanceof Error ? error.message : "network error" });
    }
    if (result.error) throw this.fail(result.error);
    return (result.data as Row | null) ?? null;
  }

  async listCommunities(): Promise<Community[]> {
    const rows = await this.rows(this.client.from("communities_public").select("*").order("name"));
    return rows.filter((r) => r.card).map(toCommunity);
  }

  async getCommunity(id: string): Promise<Community | null> {
    const row = await this.one(this.client.from("communities_public").select("*").eq("id", id).maybeSingle());
    return row?.card ? toCommunity(row) : null;
  }

  async listRuns(): Promise<Run[]> {
    const rows = await this.rows(this.client.from("runs").select("*").order("created_at", { ascending: false }).limit(200));
    return rows.map(toRun);
  }

  async getRun(id: string): Promise<Run | null> {
    const row = await this.one(this.client.from("runs").select("*").eq("id", id).maybeSingle());
    return row ? toRun(row) : null;
  }

  async listMessages(runId: string): Promise<Message[]> {
    const rows = await this.rows(this.client.from("messages").select("*").eq("run_id", runId).order("seq", { ascending: true }));
    return rows.map(toMessage);
  }

  async lastBotPosts(runIds: string[]): Promise<Record<string, Message>> {
    if (runIds.length === 0) return {};
    const rows = await this.rows(
      this.client
        .from("messages")
        .select("*")
        .in("run_id", runIds)
        .eq("role", "bot")
        .order("created_at", { ascending: false })
        .limit(Math.max(60, runIds.length * 8)),
    );
    const out: Record<string, Message> = {};
    for (const row of rows) {
      const m = toMessage(row);
      if (!out[m.runId]) out[m.runId] = m;
    }
    return out;
  }

  async listDeals(runId: string): Promise<DealVersion[]> {
    const rows = await this.rows(this.client.from("deals").select("*").eq("run_id", runId).order("created_at", { ascending: true }));
    return rows.map(toDeal).sort((a, b) => a.round - b.round || a.createdAt.localeCompare(b.createdAt));
  }

  async getDeal(dealId: string): Promise<DealVersion | null> {
    const row = await this.one(this.client.from("deals").select("*").eq("id", dealId).maybeSingle());
    return row ? toDeal(row) : null;
  }

  async listAnnouncements(dealId: string): Promise<Announcement[]> {
    const rows = await this.rows(this.client.from("announcements").select("*").eq("deal_id", dealId));
    return rows.map((r) => ({ dealId: String(r.deal_id), communityId: String(r.community_id), text: str(r.text) ?? "" }));
  }

  async getJob(id: string): Promise<Job | null> {
    const row = await this.one(this.client.from("jobs").select(JOB_COLUMNS).eq("id", id).maybeSingle());
    return row ? toJob(row) : null;
  }

  // -------------------------------------------------------------------------
  // RPCs
  // -------------------------------------------------------------------------

  async listRequests(inbox: string): Promise<RequestSummary[]> {
    const data = await this.call<unknown>("list_requests", { p_inbox: inbox });
    const requests: RequestSummary[] = arr<Row>(data).map((r) => ({
      token: String(r.token),
      status: toStatus(r.status),
      round: num(r.round, 1),
      dealId: String(r.deal_id),
      title: str(r.title) ?? "",
      date: str(r.date) ?? "",
      updatedAt: str(r.updated_at) ?? new Date(0).toISOString(),
    }));
    const dealIds = [...new Set(requests.map((r) => r.dealId))];
    if (dealIds.length) {
      try {
        const deals = await this.rows(this.client.from("deals").select("id,run_id").in("id", dealIds));
        const runByDeal = new Map(deals.map((d) => [String(d.id), String(d.run_id)]));
        for (const r of requests) r.runId = runByDeal.get(r.dealId) ?? null;
      } catch {
        /* requests still work without their thread link */
      }
    }
    return requests;
  }

  async getRequest(token: string): Promise<RequestDetail> {
    const r = await this.call<Row>("get_request", { p_token: token });
    const community = (r.community ?? {}) as Row;
    return {
      token: String(r.token),
      status: toStatus(r.status),
      note: str(r.note),
      round: num(r.round, 1),
      history: toHistory(r.history),
      community: { id: String(community.id ?? ""), name: str(community.name) ?? "" },
      dealId: String(r.deal_id),
      deal: (r.deal as Deal | null) ?? null,
      others: arr<Row>(r.others).map((o) => ({
        communityId: String(o.community_id),
        name: str(o.name) ?? String(o.community_id),
        status: toStatus(o.status),
        note: str(o.note),
        history: Array.isArray(o.history) ? toHistory(o.history) : undefined,
      })),
    };
  }

  async respond(token: string, decision: Decision, note: string | null, quick: string[]): Promise<void> {
    await this.call("respond", { p_token: token, p_decision: decision, p_note: note, p_quick: quick });
  }

  async presenterStatus(passcode: string, runId: string): Promise<PresenterRow[]> {
    const data = await this.call<unknown>("presenter_status", { p_passcode: passcode, p_run_id: runId });
    return arr<Row>(data).map((r) => ({
      communityId: String(r.community_id),
      name: str(r.name) ?? String(r.community_id),
      status: toStatus(r.status),
      round: num(r.round, 1),
      note: str(r.note),
      token: String(r.token),
      inboxToken: String(r.inbox_token ?? ""),
      history: Array.isArray(r.history) ? toHistory(r.history) : undefined,
    }));
  }

  async submitJob(passcode: string | null, type: JobKind, params: Record<string, unknown>): Promise<string> {
    const id = await this.call<unknown>("submit_job", { p_passcode: passcode ?? "", p_type: type, p_params: params });
    if (typeof id !== "string") throw new DataError("invalid", "The backend did not return a job id");
    return id;
  }

  async saveCard(passcode: string | null, card: Card, status: "draft" | "confirmed"): Promise<{ id: string; inbox: string | null }> {
    const data = await this.call<unknown>("save_card", { p_passcode: passcode ?? "", p_card: card, p_status: status });
    if (data && typeof data === "object") {
      const row = data as Row;
      return { id: String(row.id ?? card.id), inbox: str(row.inbox_token) ?? str(row.inbox) };
    }
    return { id: typeof data === "string" ? data : card.id, inbox: null };
  }

  async getEvent(dealId: string): Promise<EventInfo> {
    const r = await this.call<Row>("get_event", { p_deal_id: dealId });
    return {
      dealId: String(r.deal_id ?? dealId),
      deal: r.deal as Deal,
      backend: (str(r.backend) as BackendName | null) ?? null,
      communities: arr<Row>(r.communities).map((c) => ({
        id: String(c.id),
        name: str(c.name) ?? String(c.id),
        status: c.status === "confirmed" ? "confirmed" : c.status === "draft" ? "draft" : null,
      })),
      announcements: arr<Row>(r.announcements).map((a) => ({ communityId: String(a.community_id), text: str(a.text) ?? "" })),
      rsvpCount: num(r.rsvp_count, 0),
      allApproved: r.all_approved === true,
    };
  }

  async rsvp(dealId: string, name: string): Promise<void> {
    await this.call("rsvp", { p_deal_id: dealId, p_name: name });
  }

  async postMessage(passcode: string | null, runId: string, text: string, asCommunity: string | null): Promise<void> {
    await this.call("post_message", { p_passcode: passcode ?? "", p_run_id: runId, p_text: text, p_as_community: asCommunity });
  }

  async setRunControl(passcode: string | null, runId: string, action: RunAction): Promise<void> {
    await this.call("set_run_control", { p_passcode: passcode ?? "", p_run_id: runId, p_action: action });
  }

  async resolveInbox(inbox: string): Promise<{ communityId: string; name: string } | null> {
    const requests = await this.listRequests(inbox);
    if (!requests.length) return null;
    const detail = await this.getRequest(requests[0].token);
    return detail.community.id ? { communityId: detail.community.id, name: detail.community.name } : null;
  }

  async verifyPasscode(passcode: string): Promise<boolean> {
    try {
      await this.call("presenter_status", { p_passcode: passcode, p_run_id: ZERO_UUID });
      return true;
    } catch (error) {
      if (error instanceof DataError && error.code === "wrong_passcode") return false;
      if (error instanceof DataError && error.code === "not_found") return true;
      if (error instanceof DataError && error.code === "not_ready") {
        try {
          await this.call("save_card", { p_passcode: passcode, p_card: {}, p_status: "draft" });
          return true;
        } catch (inner) {
          return !(inner instanceof DataError && inner.code === "wrong_passcode");
        }
      }
      throw error;
    }
  }
}
