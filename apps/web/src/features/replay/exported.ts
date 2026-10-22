import {
  BACKENDS,
  CardSchema,
  RUN_STATUSES,
  STANCES,
  type AnnouncementRow,
  type BackendName,
  type Card,
  type Deal,
  type DealRow,
  type Evidence,
  type ExportedRun,
  type MessageRow,
  type RunRow,
  type RunStatus,
  type Stance,
} from "@community-bots/core";
import type { Announcement, DealVersion, Message, Run } from "../../data/types";
import { delayFor, namesFor, participantIds, sortDeals, sortMessages, type ReplayData, type ReplayMessage, type ReplayOrigin } from "./model";

/* demo-run.json comes over the network: check every field before trusting it. */
type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function isMessageRow(v: unknown): boolean {
  return isObj(v) && typeof v.id === "string" && typeof v.text === "string" && (v.role === "bot" || v.role === "human");
}

/** Only what the deal summary needs to render. */
export function isDeal(v: unknown): v is Deal {
  if (!isObj(v)) return false;
  return (
    typeof v.title === "string" &&
    typeof v.date === "string" &&
    typeof v.time === "string" &&
    typeof v.venue === "string" &&
    num(v.capacity) !== null &&
    Array.isArray(v.communities) &&
    v.communities.every((c) => isObj(c) && typeof c.id === "string" && typeof c.name === "string" && Array.isArray(c.brings)) &&
    Array.isArray(v.agenda) &&
    v.agenda.every((a) => isObj(a) && typeof a.time === "string" && typeof a.item === "string")
  );
}

/**
 * Checks that `raw` is an ExportedRun (version 1) that can be replayed. Returns null if not.
 * A deal that cannot be rendered makes the whole file invalid; unreadable cards are dropped later.
 */
export function parseExportedRun(raw: unknown): ExportedRun | null {
  if (!isObj(raw) || raw.version !== 1) return null;
  const run = raw.run;
  if (!isObj(run) || typeof run.id !== "string" || typeof run.lead_id !== "string" || typeof run.need !== "string") return null;
  if (!Array.isArray(raw.messages) || !raw.messages.every(isMessageRow)) return null;
  if (raw.cards !== undefined && !isObj(raw.cards)) return null;
  if (raw.deal !== undefined && raw.deal !== null && !(isObj(raw.deal) && typeof raw.deal.id === "string" && isDeal(raw.deal.deal))) return null;
  return raw as unknown as ExportedRun;
}

export function runFromRow(row: RunRow): Run {
  const r = row as unknown as Obj;
  const control = r.control === "paused" || r.control === "stopped" ? r.control : "running";
  const backend = str(r.backend);
  const status = str(r.status);
  return {
    id: row.id,
    leadId: row.lead_id,
    need: row.need,
    partnerIds: strings(r.partner_ids),
    backend: backend && (BACKENDS as readonly string[]).includes(backend) ? (backend as BackendName) : "mock",
    status: status && (RUN_STATUSES as readonly string[]).includes(status) ? (status as RunStatus) : "negotiating",
    consensus: typeof r.consensus === "boolean" ? r.consensus : null,
    dealId: str(r.deal_id),
    round: num(r.round) ?? 1,
    declineReason: str(r.decline_reason),
    // A recording never shows someone typing.
    typing: null,
    error: str(r.error),
    control,
    createdAt: str(r.created_at) ?? new Date(0).toISOString(),
  };
}

function evidenceFrom(v: unknown): Evidence | null {
  if (!isObj(v) || typeof v.quote !== "string") return null;
  return { quote: v.quote, verified: v.verified === true, field: str(v.field) };
}

export function messageFromRow(row: MessageRow, fallbackAt: string, index = 0): ReplayMessage {
  const r = row as unknown as Obj;
  const stance = str(r.stance);
  const message: Message = {
    id: row.id,
    runId: str(r.run_id) ?? "",
    seq: num(r.seq) ?? index,
    speaker: str(r.speaker) ?? "",
    communityId: str(r.community_id) ?? "",
    role: row.role === "bot" ? "bot" : "human",
    text: row.text,
    stance: stance && (STANCES as readonly string[]).includes(stance) ? (stance as Stance) : null,
    evidence: evidenceFrom(r.evidence),
    createdAt: str(r.created_at) ?? fallbackAt,
  };
  return { message, delayMs: delayFor(row.text, num(r.delay_ms)) };
}

/** Older exports have no round on the deal: it is round 1. */
export function dealFromRow(row: DealRow, fallbackAt: string): DealVersion {
  const r = row as unknown as Obj;
  return {
    id: row.id,
    runId: str(r.run_id) ?? "",
    round: num(r.round) ?? 1,
    deal: row.deal,
    status: str(r.status) ?? "pending_approval",
    createdAt: str(r.created_at) ?? fallbackAt,
  };
}

export function announcementFromRow(row: AnnouncementRow): Announcement | null {
  const r = row as unknown as Obj;
  const dealId = str(r.deal_id);
  const communityId = str(r.community_id);
  const text = str(r.text);
  return dealId && communityId && text ? { dealId, communityId, text } : null;
}

/** Maps a parsed ExportedRun (snake_case rows) to the web types the replay plays. */
export function replayFromExported(exported: ExportedRun, origin: ReplayOrigin = "file"): ReplayData {
  const run = runFromRow(exported.run);
  const ids = participantIds(run);
  const cards: Record<string, Card> = {};
  const known: Record<string, string> = {};
  const statuses: Record<string, "draft" | "confirmed"> = {};
  for (const [id, entry] of Object.entries(isObj(exported.cards) ? exported.cards : {})) {
    if (!isObj(entry)) continue;
    const parsed = CardSchema.safeParse(entry.card);
    if (parsed.success) cards[id] = parsed.data;
    const name = str(entry.name) ?? (parsed.success ? parsed.data.name : null);
    if (name) known[id] = name;
    if (entry.status === "draft" || entry.status === "confirmed") statuses[id] = entry.status;
  }
  const messages = sortMessages(exported.messages.map((row, i) => messageFromRow(row, run.createdAt, i)));
  const deals = sortDeals(exported.deal ? [dealFromRow(exported.deal, run.createdAt)] : []);
  const names = namesFor({ ids, known, deals, messages: messages.map((m) => m.message) });
  return {
    origin,
    run,
    messages,
    deals,
    communities: ids.map((id) => ({ id, name: names[id], status: statuses[id] ?? null })),
    cards: Object.fromEntries(Object.entries(cards).filter(([id]) => ids.includes(id))),
    names,
    announcements: (Array.isArray(exported.announcements) ? exported.announcements : []).flatMap((a) => {
      const mapped = announcementFromRow(a);
      return mapped ? [mapped] : [];
    }),
  };
}
