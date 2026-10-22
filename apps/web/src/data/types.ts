import type { BackendName, Card, Deal, Evidence, MatchCandidate, RunStatus, Stance } from "@community-bots/core";

export type SourceKind = "mock" | "supabase";

/** A row of `communities_public`. */
export interface Community {
  id: string;
  name: string;
  status: "draft" | "confirmed";
  card: Card;
  sourceUrls: string[];
  updatedAt: string;
}

export type RunControl = "running" | "paused" | "stopped";

export interface Run {
  id: string;
  leadId: string;
  need: string;
  partnerIds: string[];
  backend: BackendName;
  status: RunStatus;
  consensus: boolean | null;
  /** Latest deal (the current round). */
  dealId: string | null;
  round: number;
  declineReason: string | null;
  /** Community whose Bot is writing right now. */
  typing: string | null;
  error: string | null;
  control: RunControl;
  createdAt: string;
}

export interface Message {
  id: string;
  runId: string;
  seq: number;
  speaker: string;
  /** For Bots: the community the Bot speaks for. For humans: the community they speak for, or "" for none. */
  communityId: string;
  role: "human" | "bot";
  text: string;
  stance: Stance | null;
  /** Stored evidence. `verified` is advisory and never trusted: the browser recomputes it. */
  evidence: Evidence | null;
  createdAt: string;
}

export interface DealVersion {
  id: string;
  runId: string;
  round: number;
  deal: Deal;
  status: string;
  createdAt: string;
}

export interface Announcement {
  dealId: string;
  communityId: string;
  text: string;
}

export type ApprovalStatus = "pending" | "approved" | "declined" | "renegotiate";

export interface ApprovalHistoryEntry {
  round: number;
  decision: ApprovalStatus;
  note: string | null;
  at: string;
}

/** Approval state as far as this viewer can see it (approvals are never read directly). */
export interface ApprovalView {
  communityId: string;
  name: string;
  status: ApprovalStatus;
  note: string | null;
  round: number | null;
  /** Only for the viewer's own community, or for every community in presenter mode. */
  token?: string;
  inboxToken?: string;
  history?: ApprovalHistoryEntry[];
}

/** One row of list_requests(p_inbox). */
export interface RequestSummary {
  token: string;
  status: ApprovalStatus;
  round: number;
  dealId: string;
  title: string;
  date: string;
  updatedAt: string;
  /** Filled in by the web app from `deals` so a request can link to its thread. */
  runId?: string | null;
  communityId?: string;
  communityName?: string;
}

/** get_request(p_token). */
export interface RequestDetail {
  token: string;
  status: ApprovalStatus;
  note: string | null;
  round: number;
  history: ApprovalHistoryEntry[];
  community: { id: string; name: string };
  dealId: string;
  deal: Deal | null;
  /** `history` is optional: the contract only promises status and note for the others. */
  others: { communityId: string; name: string; status: ApprovalStatus; note: string | null; history?: ApprovalHistoryEntry[] }[];
}

/** presenter_status(p_passcode, p_run_id), one row per community. */
export interface PresenterRow {
  communityId: string;
  name: string;
  status: ApprovalStatus;
  round: number;
  note: string | null;
  token: string;
  inboxToken: string;
  /** Not in the contract yet; used when a backend provides it. */
  history?: ApprovalHistoryEntry[];
}

/** get_event(p_deal_id). */
export interface EventInfo {
  dealId: string;
  deal: Deal;
  backend: BackendName | null;
  communities: { id: string; name: string; status: "draft" | "confirmed" | null }[];
  announcements: { communityId: string; text: string }[];
  rsvpCount: number;
  allApproved: boolean;
}

export type JobKind = "draft_card" | "match" | "negotiate" | "renegotiate";
export type JobStatus = "queued" | "running" | "done" | "error";

export interface Job {
  id: string;
  type: string;
  params: unknown;
  status: JobStatus;
  progress: string | null;
  result: unknown;
  error: string | null;
  createdAt: string;
}

export interface DraftCardJobResult {
  backend?: BackendName;
  card: Card;
}

export interface MatchJobResult {
  backend?: BackendName;
  leadId: string;
  need: string;
  candidates: MatchCandidate[];
}

export interface NegotiateJobResult {
  backend?: BackendName;
  runId: string;
  dealId: string | null;
}

export type Decision = "approved" | "declined" | "renegotiate";
export type RunAction = "pause" | "resume" | "stop";

/** Every RPC the web app calls. Used to disable controls whose RPC the backend does not have yet. */
export const RPC_NAMES = [
  "list_requests",
  "get_request",
  "respond",
  "presenter_status",
  "submit_job",
  "save_card",
  "get_event",
  "rsvp",
  "post_message",
  "set_run_control",
] as const;
export type RpcName = (typeof RPC_NAMES)[number];
export type RpcState = "ready" | "missing" | "unknown";

export type DataErrorCode = "not_ready" | "wrong_passcode" | "invalid" | "not_found" | "conflict" | "network";

export class DataError extends Error {
  readonly code: DataErrorCode;
  constructor(code: DataErrorCode, message: string) {
    super(message);
    this.name = "DataError";
    this.code = code;
  }
}

/**
 * Change topics. Realtime (or the mock) emits them; useLive reloads on them.
 *   "communities" | "runs" | `run:${id}` | `messages:${runId}` | `deals:${runId}`
 *   | `job:${id}` | "approvals" | `event:${dealId}`
 */
export type Topic = string;

export interface DataSource {
  readonly kind: SourceKind;

  // Reads -----------------------------------------------------------------
  listCommunities(): Promise<Community[]>;
  getCommunity(id: string): Promise<Community | null>;
  listRuns(): Promise<Run[]>;
  getRun(id: string): Promise<Run | null>;
  listMessages(runId: string): Promise<Message[]>;
  /** Latest Bot post per run, for board cards. */
  lastBotPosts(runIds: string[]): Promise<Record<string, Message>>;
  /** Every round's deal for a run, oldest first. */
  listDeals(runId: string): Promise<DealVersion[]>;
  getDeal(dealId: string): Promise<DealVersion | null>;
  listAnnouncements(dealId: string): Promise<Announcement[]>;
  getJob(id: string): Promise<Job | null>;

  // RPCs ------------------------------------------------------------------
  listRequests(inbox: string): Promise<RequestSummary[]>;
  getRequest(token: string): Promise<RequestDetail>;
  respond(token: string, decision: Decision, note: string | null, quick: string[]): Promise<void>;
  presenterStatus(passcode: string, runId: string): Promise<PresenterRow[]>;
  submitJob(passcode: string | null, type: JobKind, params: Record<string, unknown>): Promise<string>;
  /** Returns the community id, and the organiser inbox token when the backend hands it back. */
  saveCard(passcode: string | null, card: Card, status: "draft" | "confirmed"): Promise<{ id: string; inbox: string | null }>;
  getEvent(dealId: string): Promise<EventInfo>;
  rsvp(dealId: string, name: string): Promise<void>;
  postMessage(passcode: string | null, runId: string, text: string, asCommunity: string | null): Promise<void>;
  setRunControl(passcode: string | null, runId: string, action: RunAction): Promise<void>;

  // Identity / presenter ---------------------------------------------------
  /** Which community an organiser inbox belongs to, if the backend can tell. */
  resolveInbox(inbox: string): Promise<{ communityId: string; name: string } | null>;
  /** True when the passcode is accepted. */
  verifyPasscode(passcode: string): Promise<boolean>;
  /** Whether passcode-gated calls need a passcode at all (the mock does not). */
  readonly needsPasscode: boolean;

  // Live ------------------------------------------------------------------
  subscribe(topics: Topic[], onChange: () => void): () => void;
  /** True while realtime is connected; polling is the fallback otherwise. */
  realtimeHealthy(): boolean;

  // Capabilities ----------------------------------------------------------
  rpcState(name: RpcName): RpcState;
  /** Checks which RPCs exist (without side effects). Safe to call repeatedly. */
  probe(): Promise<void>;
  onCapabilities(listener: () => void): () => void;

  /** The mock uses this to never answer on behalf of the people using the app. */
  setViewer(communityIds: string[]): void;
  /** The sample world's built-in organiser ("you"), so the mock has something waiting on you. Null for real backends. */
  sampleIdentity(): { inbox: string; communityId: string; name: string } | null;
  /** Restores the sample world. Mock only. */
  reset?(): void;
}
