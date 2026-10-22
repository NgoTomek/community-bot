import { botSpeakerName, CardSchema, checkEvidence, formatZodError, type Card } from "@community-bots/core";
import { hashString } from "../../lib/color";
import type { StorageLike } from "../../lib/identity";
import {
  DataError,
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
  type Run,
  type RunAction,
  type Topic,
} from "../types";
import {
  announcementFor,
  dealAllowedDays,
  nextAction,
  nextStep,
  renegotiationNote,
  type Action,
  type EngineState,
  type RenegotiationRequest,
} from "./engine";
import { draftCardFromUrl, rankMatches } from "./jobs";
import { SAMPLE_VIEWER_ID, SEED_COMMUNITIES, SEED_RUNS, stableUuid, type SeedRun } from "./seed";

export interface MockMessage extends Message {
  round: number;
  step: string | null;
}

interface MockApproval {
  runId: string;
  communityId: string;
  dealId: string;
  token: string;
  status: ApprovalStatus;
  note: string | null;
  round: number;
  quick: string[];
  history: ApprovalHistoryEntry[];
  updatedAt: string;
}

interface RunExtra {
  requests: RenegotiationRequest[];
  compiled: Record<number, number>;
  seedKey: string | null;
  /** Simulated organisers answer approvals on this run. */
  auto: boolean;
}

interface MockDb {
  version: number;
  communities: Record<string, Community>;
  inboxes: Record<string, string>;
  runs: Record<string, Run>;
  extra: Record<string, RunExtra>;
  messages: Record<string, MockMessage[]>;
  deals: Record<string, DealVersion>;
  approvals: Record<string, MockApproval[]>;
  announcements: Record<string, Announcement[]>;
  rsvps: Record<string, string[]>;
  jobs: Record<string, Job>;
}

const DB_VERSION = 3;
export const MOCK_STORAGE_KEY = "cb.mock.v3";

const iso = (t: number) => new Date(t).toISOString();
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : stableUuid(`${Date.now()}:${Math.random()}`));
const ACTIVE = new Set(["negotiating", "compiling", "pending_approval"]);

function emptyDb(): MockDb {
  return {
    version: DB_VERSION,
    communities: {},
    inboxes: {},
    runs: {},
    extra: {},
    messages: {},
    deals: {},
    approvals: {},
    announcements: {},
    rsvps: {},
    jobs: {},
  };
}

export interface MockOptions {
  storage?: StorageLike | null;
  /** Speed multiplier for tests and demos; 1 = real time. */
  speed?: number;
  /** Seed sample runs (default true). Tests can start from communities only. */
  seedRuns?: boolean;
}

export class MockSource implements DataSource {
  readonly kind = "mock" as const;
  readonly needsPasscode = false;

  private db: MockDb;
  private readonly storage: StorageLike | null;
  private readonly speed: number;
  private readonly seedRuns: boolean;
  private listeners = new Map<Topic, Set<() => void>>();
  private pending = new Set<Topic>();
  private flushQueued = false;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private viewer = new Set<string>([SAMPLE_VIEWER_ID]);

  constructor(options: MockOptions = {}) {
    this.storage = options.storage ?? null;
    this.speed = options.speed ?? 1;
    this.seedRuns = options.seedRuns ?? true;
    this.db = this.load() ?? this.seed(Date.now());
    this.ensureLiveRun();
    this.resumeAll();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  private load(): MockDb | null {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(MOCK_STORAGE_KEY);
      if (!raw) return null;
      const db = JSON.parse(raw) as MockDb;
      return db.version === DB_VERSION ? db : null;
    } catch {
      return null;
    }
  }

  private persist() {
    if (!this.storage) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      try {
        this.storage?.setItem(MOCK_STORAGE_KEY, JSON.stringify(this.db));
      } catch {
        /* quota: the sample world lasts for this page */
      }
    }, 250);
  }

  reset(): void {
    this.dispose();
    this.storage?.removeItem(MOCK_STORAGE_KEY);
    this.db = this.seed(Date.now());
    this.ensureLiveRun();
    this.resumeAll();
    this.emit(["communities", "runs", "approvals"]);
    for (const id of Object.keys(this.db.runs)) this.emitRun(id);
  }

  /** Stops every timer. Used by tests and reset. */
  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    if (this.persistTimer) clearTimeout(this.persistTimer);
  }

  private resumeAll() {
    for (const run of Object.values(this.db.runs)) {
      if (run.control !== "running" || !ACTIVE.has(run.status)) continue;
      if (run.status === "pending_approval") {
        this.scheduleResponses(run.id);
        if (this.db.approvals[run.id]?.some((a) => a.status === "renegotiate" && a.round === run.round)) this.scheduleNextRound(run.id);
      } else {
        this.schedule(run.id);
      }
    }
  }

  private wait(ms: number) {
    return Math.max(0, Math.round(ms / this.speed));
  }

  private later(key: string, ms: number, fn: () => void) {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        fn();
      }, this.wait(ms)),
    );
  }

  private cancel(prefix: string) {
    for (const [key, timer] of this.timers) {
      if (key.startsWith(prefix)) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  subscribe(topics: Topic[], onChange: () => void): () => void {
    for (const topic of topics) {
      if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
      this.listeners.get(topic)!.add(onChange);
    }
    return () => {
      for (const topic of topics) this.listeners.get(topic)?.delete(onChange);
    };
  }

  realtimeHealthy(): boolean {
    return true;
  }

  private emit(topics: Topic[]) {
    for (const t of topics) this.pending.add(t);
    this.persist();
    if (this.flushQueued) return;
    this.flushQueued = true;
    queueMicrotask(() => {
      this.flushQueued = false;
      const fire = new Set<() => void>();
      for (const topic of this.pending) this.listeners.get(topic)?.forEach((cb) => fire.add(cb));
      this.pending.clear();
      fire.forEach((cb) => cb());
    });
  }

  private emitRun(runId: string) {
    const run = this.db.runs[runId];
    this.emit(["runs", `run:${runId}`, `messages:${runId}`, `deals:${runId}`, `approvals:${runId}`, "approvals", ...(run?.dealId ? [`event:${run.dealId}`] : [])]);
  }

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  rpcState() {
    return "ready" as const;
  }
  async probe(): Promise<void> {}
  onCapabilities(): () => void {
    return () => {};
  }

  setViewer(communityIds: string[]): void {
    this.viewer = new Set(communityIds);
    for (const run of Object.values(this.db.runs)) if (run.status === "pending_approval") this.scheduleResponses(run.id);
  }

  sampleIdentity() {
    const community = this.db.communities[SAMPLE_VIEWER_ID];
    if (!community) return null;
    return { inbox: this.inboxFor(SAMPLE_VIEWER_ID), communityId: SAMPLE_VIEWER_ID, name: community.name };
  }

  // -------------------------------------------------------------------------
  // Seeding
  // -------------------------------------------------------------------------

  private seed(now: number): MockDb {
    this.db = emptyDb();
    for (const { status, card } of SEED_COMMUNITIES) {
      this.db.communities[card.id] = {
        id: card.id,
        name: card.name,
        status,
        card,
        sourceUrls: card.sourceUrls,
        updatedAt: iso(now - 5 * 24 * 3600_000 + (hashString(card.id) % 3600_000)),
      };
      this.db.inboxes[stableUuid(`inbox:${card.id}`)] = card.id;
    }
    if (this.seedRuns) for (const def of SEED_RUNS) this.seedRun(def, now);
    return this.db;
  }

  private seedRun(def: SeedRun, now: number, id = stableUuid(`run:${def.key}`)) {
    let t = now - def.ageMs;
    this.createRun({ id, leadId: def.leadId, partnerIds: def.partnerIds, need: def.need, at: t, seedKey: def.key, auto: def.live });
    for (const step of def.script) {
      if (step.type === "negotiate") {
        for (let guard = 0; guard < 40; guard++) {
          const action = nextAction(this.engineState(id, t));
          if (!action) break;
          t += 2000 + (hashString(`${id}:${guard}:${t}`) % 2000);
          this.applyAction(id, action, t);
          if (action.type === "compile") break;
        }
      } else if (step.type === "respond") {
        t += step.afterMs;
        const approval = this.db.approvals[id]?.find((a) => a.communityId === step.communityId);
        if (approval && approval.status === "pending") this.decide(approval, step.decision, step.note ?? null, [], t);
        this.settle(id, t, { sync: true });
      } else if (step.type === "nextRound") {
        t += step.afterMs;
        this.startNextRound(id, t);
      } else if (step.type === "rsvps") {
        const dealId = this.db.runs[id].dealId;
        if (dealId) this.db.rsvps[dealId] = Array.from({ length: step.count }, (_, i) => `Sample guest ${i + 1}`);
      }
    }
  }

  /** There is always one sample run negotiating live, so the board never looks frozen. */
  private ensureLiveRun() {
    if (!this.seedRuns) return;
    const live = Object.values(this.db.runs).some((r) => r.status === "negotiating" || r.status === "compiling");
    if (live) return;
    const def = SEED_RUNS.find((r) => r.live);
    if (!def) return;
    // Keep the original sample run and the newest finished replay; older replays are noise.
    const original = stableUuid(`run:${def.key}`);
    const replays = Object.values(this.db.runs)
      .filter((r) => r.id !== original && this.db.extra[r.id]?.seedKey === def.key)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const old of replays.slice(1)) this.removeRun(old.id);
    this.seedRun(def, Date.now(), stableUuid(`run:${def.key}:${Date.now()}`));
  }

  private removeRun(runId: string) {
    for (const deal of Object.values(this.db.deals)) {
      if (deal.runId !== runId) continue;
      delete this.db.deals[deal.id];
      delete this.db.announcements[deal.id];
      delete this.db.rsvps[deal.id];
    }
    delete this.db.runs[runId];
    delete this.db.extra[runId];
    delete this.db.messages[runId];
    delete this.db.approvals[runId];
  }

  // -------------------------------------------------------------------------
  // Engine glue
  // -------------------------------------------------------------------------

  private engineState(runId: string, at: number): EngineState {
    const run = this.db.runs[runId];
    const extra = this.db.extra[runId];
    const communities: EngineState["communities"] = {};
    for (const id of [run.leadId, ...run.partnerIds]) {
      const c = this.db.communities[id];
      if (c) communities[id] = { id, name: c.name, status: c.status, card: c.card };
    }
    return {
      leadId: run.leadId,
      partnerIds: run.partnerIds,
      need: run.need,
      round: run.round,
      communities,
      messages: (this.db.messages[runId] ?? []).map((m) => ({
        seq: m.seq,
        role: m.role,
        communityId: m.communityId,
        text: m.text,
        stance: m.stance,
        at: Date.parse(m.createdAt),
        round: m.round,
        step: m.step,
      })),
      compiled: extra.compiled,
      requests: extra.requests,
      now: new Date(at),
    };
  }

  private nextSeq(runId: string) {
    const messages = this.db.messages[runId] ?? [];
    return messages.length ? messages[messages.length - 1].seq + 1 : 0;
  }

  private applyAction(runId: string, action: Action, at: number) {
    const run = this.db.runs[runId];
    if (action.type === "bot") {
      const community = this.db.communities[action.communityId];
      const message: MockMessage = {
        id: newId(),
        runId,
        seq: this.nextSeq(runId),
        speaker: botSpeakerName(community?.name ?? action.communityId),
        communityId: action.communityId,
        role: "bot",
        text: action.text,
        stance: action.stance,
        evidence: community ? checkEvidence(action.evidence, community.card) : null,
        createdAt: iso(at),
        round: run.round,
        step: action.step,
      };
      this.db.messages[runId] = [...(this.db.messages[runId] ?? []), message];
      run.typing = null;
      if (run.status === "compiling") run.status = "negotiating";
      this.emit([`messages:${runId}`, `run:${runId}`, "runs"]);
      return;
    }
    this.compileRound(runId, action, at);
  }

  private compileRound(runId: string, action: Extract<Action, { type: "compile" }>, at: number) {
    const run = this.db.runs[runId];
    const extra = this.db.extra[runId];
    extra.compiled = { ...extra.compiled, [action.round]: at };
    const previous = run.dealId ? this.db.deals[run.dealId] : null;
    if (previous && previous.status === "pending_approval") previous.status = "changes_requested";
    const dealId = newId();
    this.db.deals[dealId] = { id: dealId, runId, round: action.round, deal: action.deal, status: "pending_approval", createdAt: iso(at) };
    run.dealId = dealId;
    run.status = "pending_approval";
    run.consensus = true;
    run.typing = null;

    const inDeal = new Set(action.deal.communities.map((c) => c.id));
    const existing = this.db.approvals[runId] ?? [];
    const approvals: MockApproval[] = action.deal.communities.map((c) => {
      const old = existing.find((a) => a.communityId === c.id);
      return {
        runId,
        communityId: c.id,
        dealId,
        token: old?.token ?? stableUuid(`token:${runId}:${c.id}`),
        status: "pending",
        note: null,
        round: action.round,
        quick: [],
        history: old?.history ?? [],
        updatedAt: iso(at),
      };
    });
    this.db.approvals[runId] = [...approvals, ...existing.filter((a) => !inDeal.has(a.communityId))];
    this.db.announcements[dealId] = action.deal.communities.map((c) => ({ dealId, communityId: c.id, text: announcementFor(action.deal, c.id) }));
    this.emitRun(runId);
  }

  /** Schedules the next engine action for a live run. */
  private schedule(runId: string) {
    const run = this.db.runs[runId];
    if (!run || run.control !== "running" || !ACTIVE.has(run.status)) {
      this.cancel(`run:${runId}`);
      return;
    }
    const action = nextAction(this.engineState(runId, Date.now()));
    if (!action) {
      if (run.typing) {
        run.typing = null;
        this.emit([`run:${runId}`, "runs"]);
      }
      return;
    }
    if (action.type === "bot") {
      run.typing = action.communityId;
      if (run.status === "compiling") run.status = "negotiating";
    } else {
      run.typing = null;
      run.status = "compiling";
    }
    this.emit([`run:${runId}`, "runs"]);
    const delay = action.type === "compile" ? 1500 : 2000 + (hashString(`${runId}:${this.nextSeq(runId)}`) % 2000);
    this.later(`run:${runId}`, delay, () => {
      const current = this.db.runs[runId];
      if (!current || current.control !== "running" || !ACTIVE.has(current.status)) return;
      const now = Date.now();
      const fresh = nextAction(this.engineState(runId, now));
      if (fresh) {
        this.applyAction(runId, fresh, now);
        if (fresh.type === "compile") this.scheduleResponses(runId);
      }
      this.schedule(runId);
    });
  }

  /** Simulated organisers answer the current round, never for the people using the app. */
  private scheduleResponses(runId: string) {
    const run = this.db.runs[runId];
    const extra = this.db.extra[runId];
    if (!run || !extra?.auto || run.status !== "pending_approval" || !run.dealId) return;
    const round = run.round;
    const deal = this.db.deals[run.dealId]?.deal;
    if (!deal) return;
    const pending = (this.db.approvals[runId] ?? []).filter((a) => a.status === "pending" && a.round === round && !this.viewer.has(a.communityId));
    if (!pending.length) return;
    let requester: string | null = null;
    if (round === 1) {
      const order = [...deal.communities.map((c) => c.id).filter((id) => id !== run.leadId), run.leadId];
      requester = order.find((id) => !this.viewer.has(id)) ?? null;
    }
    const ordered = [...pending].sort((a, b) => (a.communityId === requester ? -1 : b.communityId === requester ? 1 : 0));
    ordered.forEach((approval, i) => {
      const key = `resp:${runId}:${approval.communityId}:${round}`;
      if (this.timers.has(key)) return;
      const delay = 2500 + i * 1800 + (hashString(key) % 700);
      this.later(key, delay, () => {
        const current = this.db.runs[runId];
        const a = this.db.approvals[runId]?.find((x) => x.communityId === approval.communityId);
        if (!current || !a || a.status !== "pending" || a.round !== round) return;
        if (current.status !== "pending_approval" || current.round !== round || this.viewer.has(a.communityId)) return;
        const now = Date.now();
        if (a.communityId === requester) {
          const c = this.db.communities[a.communityId];
          const note = c ? renegotiationNote(c.card, deal, dealAllowedDays(this.engineState(runId, now))) : "Could we find a different date?";
          this.decide(a, "renegotiate", note, ["Simulated organiser"], now);
        } else {
          this.decide(a, "approved", null, [], now);
        }
        this.settle(runId, now, { sync: false });
      });
    });
  }

  private decide(approval: MockApproval, decision: Decision, note: string | null, quick: string[], at: number) {
    approval.status = decision;
    approval.note = note;
    approval.quick = quick;
    approval.updatedAt = iso(at);
    approval.history = [...approval.history, { round: approval.round, decision, note, at: iso(at) }];
  }

  /** Recomputes the run after a decision: confirmed, declined, or a new round. */
  private settle(runId: string, at: number, opts: { sync: boolean }) {
    const run = this.db.runs[runId];
    const deal = run.dealId ? this.db.deals[run.dealId] : null;
    const approvals = (this.db.approvals[runId] ?? []).filter((a) => a.round === run.round && deal?.deal.communities.some((c) => c.id === a.communityId));
    const declined = approvals.find((a) => a.status === "declined");
    if (declined) {
      run.status = "declined";
      run.declineReason = declined.note;
      run.typing = null;
      if (deal) deal.status = "declined";
      this.cancel(`run:${runId}`);
      this.cancel(`resp:${runId}`);
    } else if (approvals.length && approvals.every((a) => a.status === "approved")) {
      run.status = "confirmed";
      if (deal) deal.status = "confirmed";
    } else if (approvals.some((a) => a.status === "renegotiate")) {
      if (opts.sync) this.startNextRound(runId, at + 60_000);
      else this.scheduleNextRound(runId);
    }
    this.emitRun(runId);
  }

  private scheduleNextRound(runId: string) {
    const run = this.db.runs[runId];
    this.later(`round:${runId}:${run.round}`, 1800, () => {
      this.startNextRound(runId, Date.now());
      this.schedule(runId);
    });
  }

  private startNextRound(runId: string, at: number) {
    const run = this.db.runs[runId];
    if (!run || run.status !== "pending_approval") return;
    const asks = (this.db.approvals[runId] ?? []).filter((a) => a.status === "renegotiate" && a.round === run.round);
    if (!asks.length) return;
    const extra = this.db.extra[runId];
    extra.requests = [
      ...extra.requests,
      ...asks.map((a) => ({ at: Math.min(Date.parse(a.updatedAt), at), round: run.round, communityId: a.communityId, note: a.note ?? "" })),
    ];
    const deal = run.dealId ? this.db.deals[run.dealId] : null;
    if (deal) deal.status = "changes_requested";
    run.round += 1;
    run.status = "negotiating";
    this.cancel(`resp:${runId}`);
    this.emitRun(runId);
  }

  private createRun(input: { id: string; leadId: string; partnerIds: string[]; need: string; at: number; seedKey: string | null; auto: boolean }) {
    const lead = this.db.communities[input.leadId];
    const run: Run = {
      id: input.id,
      leadId: input.leadId,
      need: input.need,
      partnerIds: input.partnerIds,
      backend: "mock",
      status: "negotiating",
      consensus: null,
      dealId: null,
      round: 1,
      declineReason: null,
      typing: null,
      error: null,
      control: "running",
      createdAt: iso(input.at),
    };
    this.db.runs[run.id] = run;
    this.db.extra[run.id] = { requests: [], compiled: {}, seedKey: input.seedKey, auto: true };
    this.db.approvals[run.id] = [];
    this.db.messages[run.id] = [
      {
        id: newId(),
        runId: run.id,
        seq: 0,
        speaker: `${lead?.name ?? input.leadId} organiser`,
        communityId: input.leadId,
        role: "human",
        text: input.need,
        stance: null,
        evidence: null,
        createdAt: iso(input.at),
        round: 1,
        step: null,
      },
    ];
    return run;
  }

  private inboxFor(communityId: string): string {
    const found = Object.entries(this.db.inboxes).find(([, id]) => id === communityId)?.[0];
    if (found) return found;
    const inbox = newId();
    this.db.inboxes[inbox] = communityId;
    return inbox;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async listCommunities(): Promise<Community[]> {
    return Object.values(this.db.communities).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getCommunity(id: string): Promise<Community | null> {
    return this.db.communities[id] ?? null;
  }

  async listRuns(): Promise<Run[]> {
    return Object.values(this.db.runs)
      .map((r) => ({ ...r }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getRun(id: string): Promise<Run | null> {
    const run = this.db.runs[id];
    return run ? { ...run } : null;
  }

  async listMessages(runId: string): Promise<Message[]> {
    return [...(this.db.messages[runId] ?? [])];
  }

  async lastBotPosts(runIds: string[]): Promise<Record<string, Message>> {
    const out: Record<string, Message> = {};
    for (const id of runIds) {
      const bots = (this.db.messages[id] ?? []).filter((m) => m.role === "bot");
      if (bots.length) out[id] = bots[bots.length - 1];
    }
    return out;
  }

  async listDeals(runId: string): Promise<DealVersion[]> {
    return Object.values(this.db.deals)
      .filter((d) => d.runId === runId)
      .sort((a, b) => a.round - b.round)
      .map((d) => ({ ...d }));
  }

  async getDeal(dealId: string): Promise<DealVersion | null> {
    const deal = this.db.deals[dealId];
    return deal ? { ...deal } : null;
  }

  async listAnnouncements(dealId: string): Promise<Announcement[]> {
    return [...(this.db.announcements[dealId] ?? [])];
  }

  async getJob(id: string): Promise<Job | null> {
    const job = this.db.jobs[id];
    return job ? { ...job } : null;
  }

  // -------------------------------------------------------------------------
  // RPCs
  // -------------------------------------------------------------------------

  async listRequests(inbox: string): Promise<RequestSummary[]> {
    const communityId = this.db.inboxes[inbox.toLowerCase()];
    if (!communityId) return [];
    const out: RequestSummary[] = [];
    for (const [runId, approvals] of Object.entries(this.db.approvals)) {
      for (const a of approvals) {
        if (a.communityId !== communityId) continue;
        const deal = this.db.deals[a.dealId]?.deal;
        out.push({
          token: a.token,
          status: a.status,
          round: a.round,
          dealId: a.dealId,
          title: deal?.title ?? "",
          date: deal?.date ?? "",
          updatedAt: a.updatedAt,
          runId,
          communityId,
          communityName: this.db.communities[communityId]?.name,
        });
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private approvalByToken(token: string): MockApproval {
    for (const approvals of Object.values(this.db.approvals)) {
      const hit = approvals.find((a) => a.token === token);
      if (hit) return hit;
    }
    throw new DataError("not_found", "This approval link is not valid");
  }

  async getRequest(token: string): Promise<RequestDetail> {
    const a = this.approvalByToken(token);
    const others = (this.db.approvals[a.runId] ?? [])
      .filter((x) => x.communityId !== a.communityId)
      .map((x) => ({ communityId: x.communityId, name: this.db.communities[x.communityId]?.name ?? x.communityId, status: x.status, note: x.note, history: x.history }))
      .sort((x, y) => x.name.localeCompare(y.name));
    return {
      token: a.token,
      status: a.status,
      note: a.note,
      round: a.round,
      history: a.history,
      community: { id: a.communityId, name: this.db.communities[a.communityId]?.name ?? a.communityId },
      dealId: a.dealId,
      deal: this.db.deals[a.dealId]?.deal ?? null,
      others,
    };
  }

  async respond(token: string, decision: Decision, note: string | null, quick: string[]): Promise<void> {
    if (!["approved", "declined", "renegotiate"].includes(decision)) throw new DataError("invalid", "Decision must be approved, declined or renegotiate");
    const a = this.approvalByToken(token);
    const clean = note?.trim() ? note.trim().slice(0, 2000) : null;
    if (decision !== "approved" && (clean?.length ?? 0) < 3) {
      throw new DataError("invalid", "A note of at least 3 characters is required to decline or renegotiate");
    }
    if (a.status !== "pending") throw new DataError("conflict", `This request is no longer pending (status: ${a.status})`);
    const run = this.db.runs[a.runId];
    if (run.status !== "pending_approval") throw new DataError("conflict", "The Bots are still negotiating this round");
    const now = Date.now();
    this.decide(a, decision, clean, quick, now);
    this.settle(a.runId, now, { sync: false });
  }

  async presenterStatus(passcode: string, runId: string): Promise<PresenterRow[]> {
    if (!passcode.trim()) throw new DataError("wrong_passcode", "Wrong passcode");
    if (!this.db.runs[runId]) throw new DataError("not_found", "Unknown run");
    return (this.db.approvals[runId] ?? [])
      .map((a) => ({
        communityId: a.communityId,
        name: this.db.communities[a.communityId]?.name ?? a.communityId,
        status: a.status,
        round: a.round,
        note: a.note,
        token: a.token,
        inboxToken: this.inboxFor(a.communityId),
        history: a.history,
      }))
      .sort((x, y) => x.name.localeCompare(y.name));
  }

  async submitJob(_passcode: string | null, type: JobKind, params: Record<string, unknown>): Promise<string> {
    if (!["draft_card", "match", "negotiate", "renegotiate"].includes(type)) throw new DataError("invalid", `Unknown job type: ${type}`);
    const id = newId();
    const job: Job = { id, type, params, status: "queued", progress: null, result: null, error: null, createdAt: iso(Date.now()) };
    this.db.jobs[id] = job;
    this.emit([`job:${id}`]);
    const progress = (ms: number, text: string) =>
      this.later(`job:${id}:${text}`, ms, () => {
        this.db.jobs[id] = { ...this.db.jobs[id], status: "running", progress: text };
        this.emit([`job:${id}`]);
      });
    const finish = (ms: number, outcome: () => unknown) =>
      this.later(`job:${id}:done`, ms, () => {
        try {
          const result = outcome();
          this.db.jobs[id] = { ...this.db.jobs[id], status: "done", progress: null, result };
        } catch (error) {
          this.db.jobs[id] = { ...this.db.jobs[id], status: "error", progress: null, error: error instanceof Error ? error.message : "Something went wrong" };
        }
        this.emit([`job:${id}`]);
      });

    if (type === "draft_card") {
      progress(400, "browsing");
      progress(1500, "reading the page");
      progress(2500, "writing card");
      finish(3400, () => {
        const url = String(params.url ?? "").trim();
        if (!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(url)) throw new Error("That doesn't look like a web address. Paste a link that starts with https://");
        const card = draftCardFromUrl(url, typeof params.name === "string" ? params.name : undefined);
        return { backend: "mock", card };
      });
    } else if (type === "match") {
      progress(300, "reading cards");
      progress(1100, "ranking communities");
      finish(2000, () => {
        const lead = this.db.communities[String(params.leadId ?? "")];
        if (!lead) throw new Error("Pick the community that is asking first.");
        const need = String(params.need ?? "").trim();
        if (need.length < 5) throw new Error("Describe the need in a few more words.");
        return { backend: "mock", leadId: lead.id, need, candidates: rankMatches(lead, need, Object.values(this.db.communities)) };
      });
    } else if (type === "negotiate") {
      progress(200, "starting");
      finish(600, () => {
        const leadId = String(params.leadId ?? "");
        const partnerIds = Array.isArray(params.partnerIds) ? params.partnerIds.map(String) : [];
        const need = String(params.need ?? "").trim();
        if (!this.db.communities[leadId]) throw new Error("Pick the community that is asking first.");
        if (partnerIds.length < 1 || partnerIds.length > 3) throw new Error("Pick between one and three partners.");
        const missing = partnerIds.find((p) => !this.db.communities[p]);
        if (missing) throw new Error(`Community ${missing} was not found`);
        if (need.length < 5) throw new Error("Describe the need in a few more words.");
        const runId = typeof params.runId === "string" && params.runId ? params.runId : newId();
        this.createRun({ id: runId, leadId, partnerIds, need, at: Date.now(), seedKey: null, auto: true });
        this.emitRun(runId);
        this.schedule(runId);
        return { backend: "mock", runId, dealId: null };
      });
    } else {
      finish(400, () => {
        const runId = String(params.runId ?? "");
        if (!this.db.runs[runId]) throw new Error("Unknown run");
        this.startNextRound(runId, Date.now());
        this.schedule(runId);
        return { backend: "mock", runId, dealId: this.db.runs[runId].dealId };
      });
    }
    return id;
  }

  async saveCard(_passcode: string | null, card: Card, status: "draft" | "confirmed"): Promise<{ id: string; inbox: string | null }> {
    const parsed = CardSchema.safeParse(card);
    if (!parsed.success) throw new DataError("invalid", formatZodError(parsed.error));
    const c = parsed.data;
    this.db.communities[c.id] = { id: c.id, name: c.name, status, card: c, sourceUrls: c.sourceUrls, updatedAt: iso(Date.now()) };
    const inbox = this.inboxFor(c.id);
    this.emit(["communities", `community:${c.id}`]);
    return { id: c.id, inbox };
  }

  async getEvent(dealId: string): Promise<EventInfo> {
    const version = this.db.deals[dealId];
    if (!version) throw new DataError("not_found", "Unknown event");
    const run = this.db.runs[version.runId];
    const approvals = this.db.approvals[version.runId] ?? [];
    return {
      dealId,
      deal: version.deal,
      backend: run?.backend ?? "mock",
      communities: version.deal.communities.map((c) => ({ id: c.id, name: this.db.communities[c.id]?.name ?? c.name, status: this.db.communities[c.id]?.status ?? null })),
      announcements: (this.db.announcements[dealId] ?? []).map((a) => ({ communityId: a.communityId, text: a.text })),
      rsvpCount: this.db.rsvps[dealId]?.length ?? 0,
      allApproved: approvals.length > 0 && approvals.every((a) => a.status === "approved") && run?.dealId === dealId,
    };
  }

  async rsvp(dealId: string, name: string): Promise<void> {
    if (!this.db.deals[dealId]) throw new DataError("not_found", "Unknown event");
    const clean = name.trim();
    if (clean.length < 1 || clean.length > 60) throw new DataError("invalid", "Name must be between 1 and 60 characters");
    const list = this.db.rsvps[dealId] ?? [];
    if (list.length >= 200) throw new DataError("conflict", "This event is full (200 RSVPs)");
    this.db.rsvps[dealId] = [...list, clean];
    this.emit([`event:${dealId}`]);
  }

  async postMessage(_passcode: string | null, runId: string, text: string, asCommunity: string | null): Promise<void> {
    const run = this.db.runs[runId];
    if (!run) throw new DataError("not_found", "Unknown run");
    const clean = text.trim();
    if (!clean) throw new DataError("invalid", "Write a message first");
    if (clean.length > 1000) throw new DataError("invalid", "Keep messages under 1,000 characters");
    if (run.control === "stopped") throw new DataError("conflict", "This run was stopped");
    if (asCommunity && ![run.leadId, ...run.partnerIds].includes(asCommunity)) {
      throw new DataError("invalid", "You can only speak for a community in this collab");
    }
    let step: string | null = null;
    if (asCommunity && (run.status === "negotiating" || run.status === "compiling")) {
      const next = nextStep(this.engineState(runId, Date.now()));
      if (next?.speaker === asCommunity) step = next.key;
    }
    const community = asCommunity ? this.db.communities[asCommunity] : null;
    const message: MockMessage = {
      id: newId(),
      runId,
      seq: this.nextSeq(runId),
      speaker: community ? `${community.name} organiser` : "Organiser",
      communityId: asCommunity ?? "",
      role: "human",
      text: clean,
      stance: null,
      evidence: null,
      createdAt: iso(Date.now()),
      round: run.round,
      step,
    };
    this.db.messages[runId] = [...(this.db.messages[runId] ?? []), message];
    this.emit([`messages:${runId}`, `run:${runId}`, "runs"]);
    this.schedule(runId);
  }

  async setRunControl(_passcode: string | null, runId: string, action: RunAction): Promise<void> {
    const run = this.db.runs[runId];
    if (!run) throw new DataError("not_found", "Unknown run");
    if (run.control === "stopped") throw new DataError("conflict", "This run was already stopped");
    if (!ACTIVE.has(run.status)) throw new DataError("conflict", "This run has already finished");
    if (action === "pause") {
      run.control = "paused";
      run.typing = null;
      this.cancel(`run:${runId}`);
    } else if (action === "resume") {
      run.control = "running";
      this.schedule(runId);
      if (run.status === "pending_approval") this.scheduleResponses(runId);
    } else {
      run.control = "stopped";
      run.typing = null;
      this.cancel(`run:${runId}`);
      this.cancel(`resp:${runId}`);
      this.cancel(`round:${runId}`);
    }
    this.emitRun(runId);
  }

  async resolveInbox(inbox: string) {
    const id = this.db.inboxes[inbox.toLowerCase()];
    const community = id ? this.db.communities[id] : null;
    return community ? { communityId: community.id, name: community.name } : null;
  }

  async verifyPasscode(passcode: string): Promise<boolean> {
    return passcode.trim().length > 0;
  }
}
