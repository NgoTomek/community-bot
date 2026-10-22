import { z } from "zod";

/** Days of the week, as stored in `card.constraints.days`. */
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Day = (typeof DAYS)[number];
export const DaySchema = z.enum(DAYS);

/** Inferences on a card are strings that start with this prefix. */
export const GUESS_PREFIX = "GUESS: ";

export const BACKENDS = ["grokbot", "openai", "mock"] as const;
export type BackendName = (typeof BACKENDS)[number];
export const BackendNameSchema = z.enum(BACKENDS);

export const COMMUNITY_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CommunityIdSchema = z.string().min(1).max(64).regex(COMMUNITY_ID_RE, "must be kebab-case");

// ---------------------------------------------------------------------------
// Community card
// ---------------------------------------------------------------------------

export const CardSchema = z.object({
  id: CommunityIdSchema,
  name: z.string().min(1).max(120),
  tagline: z.string().nullable(),
  location: z.string().nullable(),
  /** Who they are and rough size, e.g. "Student founders at Imperial, ~800 members". */
  members: z.string().nullable(),
  runs: z.array(z.object({ event: z.string().min(1), frequency: z.string().nullable() })),
  offers: z.array(z.string().min(1)),
  needs: z.array(z.string().min(1)),
  constraints: z.object({
    /** Days the community can host or attend. Empty array = not known, so no restriction. */
    days: z.array(DaySchema),
    maxGroupSize: z.number().int().positive().nullable(),
    notes: z.string().nullable(),
  }),
  tone: z.string().nullable(),
  sourceUrls: z.array(z.string().min(1)),
});
export type Card = z.infer<typeof CardSchema>;

export type CommunityStatus = "draft" | "confirmed";

// ---------------------------------------------------------------------------
// Negotiation messages
// ---------------------------------------------------------------------------

export const STANCES = ["offer", "counter", "accept", "decline", "question"] as const;
export type Stance = (typeof STANCES)[number];
export const StanceSchema = z.enum(STANCES);

/** What a Community Bot must reply with on every negotiation turn. */
export const BotReplySchema = z.object({
  text: z.string().min(1),
  stance: StanceSchema,
  evidence: z.string().nullable(),
});
export type BotReply = z.infer<typeof BotReplySchema>;

/** Evidence as stored on a message. `verified` is advisory only: the browser recomputes it. */
export interface Evidence {
  quote: string;
  verified: boolean;
  /** Path of the card field that contains the quote, e.g. "offers[1]". Null if not found. */
  field: string | null;
}

export type MessageRole = "human" | "bot";

/** A chat message as produced by the orchestrator (before it gets a DB id). */
export interface ChatMessage {
  seq: number;
  speaker: string;
  communityId: string;
  role: MessageRole;
  text: string;
  stance: Stance | null;
  evidence: Evidence | null;
  delayMs: number;
}

// ---------------------------------------------------------------------------
// Matchmaking
// ---------------------------------------------------------------------------

export const FITS = ["strong", "good", "weak"] as const;
export type Fit = (typeof FITS)[number];

export const MatchReasonSchema = z.object({
  claim: z.string().min(1),
  evidence: z.string().min(1),
  cardOwnerId: z.string().min(1),
});
export type MatchReason = z.infer<typeof MatchReasonSchema>;

export const MatchCandidateSchema = z.object({
  communityId: z.string().min(1),
  fit: z.enum(FITS),
  reasons: z.array(MatchReasonSchema),
  concerns: z.array(z.string()).default([]),
});
export type MatchCandidate = z.infer<typeof MatchCandidateSchema>;
export const MatchResultSchema = z.array(MatchCandidateSchema);

// ---------------------------------------------------------------------------
// Deal (compiled by the Scribe)
// ---------------------------------------------------------------------------

export const DEAL_ROLES = ["host", "co-host", "speaker", "audience"] as const;
export type DealRole = (typeof DEAL_ROLES)[number];

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const DealSchema = z.object({
  title: z.string().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  /** Start time, 24h "HH:MM". */
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:MM (24h)"),
  venue: z.string().min(1),
  capacity: z.number().int().positive(),
  description: z.string().min(1).refine((s) => wordCount(s) <= 40, "description must be at most 40 words"),
  communities: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        role: z.enum(DEAL_ROLES),
        brings: z.array(z.string().min(1)),
      }),
    )
    .min(2, "a deal needs at least two communities"),
  agenda: z.array(z.object({ time: z.string().min(1), item: z.string().min(1) })).min(1),
  reasons: z.array(z.object({ communityId: z.string().min(1), evidence: z.string().min(1) })),
  consensus: z.boolean(),
  status: z.literal("pending_approval"),
});
export type Deal = z.infer<typeof DealSchema>;

export const AnnouncementReplySchema = z.object({
  text: z.string().min(1).refine((s) => wordCount(s) <= 50, "announcement must be at most 50 words"),
});

// ---------------------------------------------------------------------------
// Jobs (inserted by the web app, processed by the worker)
// ---------------------------------------------------------------------------

export const LIMITS = {
  url: 300,
  need: 600,
  name: 80,
  maxPartners: 3,
  note: 500,
  rsvpName: 80,
  maxBotMessages: 12,
} as const;

const httpUrl = z
  .string()
  .max(LIMITS.url)
  .refine((u) => /^https?:\/\/[^\s]+$/i.test(u), "must be an http(s) URL");

export const JOB_TYPES = ["draft_card", "confirm_card", "match", "negotiate"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const DraftCardParamsSchema = z.object({
  url: httpUrl,
  /** Optional display name hint, e.g. from seed/communities.json. Also fixes the community id. */
  name: z.string().min(1).max(LIMITS.name).optional(),
});
export const ConfirmCardParamsSchema = z.object({ card: CardSchema });
export const MatchParamsSchema = z.object({
  leadId: CommunityIdSchema,
  need: z.string().trim().min(5).max(LIMITS.need),
});
export const NegotiateParamsSchema = z.object({
  /** Optional client-generated id so the web app can open /run/:runId immediately. */
  runId: z.string().uuid().optional(),
  leadId: CommunityIdSchema,
  need: z.string().trim().min(5).max(LIMITS.need),
  partnerIds: z.array(CommunityIdSchema).min(1).max(LIMITS.maxPartners),
  /** The match job the partners were picked from; its verified reasons are copied to the run. */
  matchJobId: z.string().uuid().optional(),
});
export type DraftCardParams = z.infer<typeof DraftCardParamsSchema>;
export type ConfirmCardParams = z.infer<typeof ConfirmCardParamsSchema>;
export type MatchParams = z.infer<typeof MatchParamsSchema>;
export type NegotiateParams = z.infer<typeof NegotiateParamsSchema>;

export const JOB_PARAM_SCHEMAS = {
  draft_card: DraftCardParamsSchema,
  confirm_card: ConfirmCardParamsSchema,
  match: MatchParamsSchema,
  negotiate: NegotiateParamsSchema,
} as const;

export type JobStatus = "queued" | "running" | "done" | "error";

/** Job results. Every result carries the backend that produced it. */
export interface DraftCardResult {
  backend: BackendName;
  card: Card;
}
export interface ConfirmCardResult {
  backend: BackendName;
  card: Card;
}
export interface MatchResult {
  backend: BackendName;
  leadId: string;
  need: string;
  candidates: MatchCandidate[];
}
export interface NegotiateResult {
  backend: BackendName;
  runId: string;
  dealId: string | null;
  consensus: boolean;
}

// ---------------------------------------------------------------------------
// Database rows (snake_case, as returned by supabase-js)
// ---------------------------------------------------------------------------

export interface CommunityRow {
  id: string;
  name: string;
  status: CommunityStatus;
  card: Card;
  source_urls: string[];
  /** Backend that drafted the card. "mock" cards are sample data and must be labelled. */
  backend: BackendName | null;
  updated_at: string;
}

/** Columns anon may read from jobs. `passcode` is deliberately not readable by anon. */
export const JOB_PUBLIC_COLUMNS = "id,type,params,status,progress,result,error,created_at";

export interface JobRow {
  id: string;
  type: JobType;
  params: unknown;
  status: JobStatus;
  progress: string | null;
  result: unknown;
  error: string | null;
  created_at: string;
}

export const RUN_STATUSES = [
  "matching",
  "negotiating",
  "compiling",
  "pending_approval",
  "confirmed",
  "declined",
  "error",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export interface RunRow {
  id: string;
  lead_id: string;
  need: string;
  partner_ids: string[];
  backend: BackendName;
  status: RunStatus;
  consensus: boolean | null;
  deal_id: string | null;
  /** Verified match candidates for the chosen partners (copied from the match job). */
  match: MatchCandidate[] | null;
  /** Community id whose Bot is currently writing, for the typing indicator. */
  typing: string | null;
  error: string | null;
  created_at: string;
}

export interface MessageRow {
  id: string;
  run_id: string;
  seq: number;
  speaker: string;
  community_id: string;
  role: MessageRole;
  text: string;
  stance: Stance | null;
  evidence: Evidence | null;
  delay_ms: number;
  created_at: string;
}

export type DealStatus = "pending_approval" | "confirmed" | "declined" | "changes_requested";

export interface DealRow {
  id: string;
  run_id: string;
  deal: Deal;
  status: DealStatus;
  created_at: string;
}

export type ApprovalStatus = "pending" | "approved" | "declined" | "changes_requested";

export interface ApprovalRow {
  deal_id: string;
  community_id: string;
  token: string;
  status: ApprovalStatus;
  note: string | null;
  updated_at: string;
}

export interface AnnouncementRow {
  deal_id: string;
  community_id: string;
  text: string;
}

export interface RsvpRow {
  id: string;
  deal_id: string;
  name: string;
  created_at: string;
}

/** Shape of apps/web/public/demo-run.json, written by `npm run export-run`. Tokens are stripped. */
export interface ExportedRun {
  version: 1;
  exportedAt: string;
  run: RunRow;
  cards: Record<string, { name: string; status: CommunityStatus; card: Card }>;
  messages: MessageRow[];
  deal: DealRow | null;
  approvals: Omit<ApprovalRow, "token">[];
  announcements: AnnouncementRow[];
}

/** Turns zod issues into short readable lines, fed back to Bots on retry. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("; ");
}
