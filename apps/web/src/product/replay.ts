import { CardSchema, DealSchema, formatZodError, type Card, type Deal } from "@community-bots/core";
import { getCommunities, getRun, listAnnouncements, listDeals, listMessages, type AnnouncementView, type LiveMessage } from "./api";

export interface ReplayData {
  id: string;
  backend: string | null;
  need: string;
  status: string;
  messages: LiveMessage[];
  deal: Deal | null;
  dealProblem: string | null;
  cards: Record<string, Card | undefined>;
  names: Record<string, string>;
  announcements: AnnouncementView[];
  recorded: { name: string; status: string; note: string | null }[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function messageFrom(value: unknown, index: number): LiveMessage | null {
  const row = asRecord(value);
  if (!row || typeof row.text !== "string") return null;
  let evidence: unknown = row.evidence ?? null;
  if (typeof evidence === "string") {
    try {
      evidence = JSON.parse(evidence) as unknown;
    } catch {
      evidence = null;
    }
  }
  return {
    id: typeof row.id === "string" ? row.id : `m-${index}`,
    seq: typeof row.seq === "number" ? row.seq : index,
    speaker: typeof row.speaker === "string" ? row.speaker : "",
    communityId: typeof row.community_id === "string" ? row.community_id : "",
    role: row.role === "bot" ? "bot" : "human",
    text: row.text,
    stance: typeof row.stance === "string" ? row.stance : null,
    evidence,
    delayMs: typeof row.delay_ms === "number" && Number.isFinite(row.delay_ms) ? row.delay_ms : 0,
  };
}

export function replayFromExport(value: unknown): ReplayData {
  const root = asRecord(value);
  if (!root || !Array.isArray(root.messages)) throw new Error("This file is not a saved run.");
  const run = asRecord(root.run);
  const id = run && typeof run.id === "string" ? run.id : "";
  if (!id) throw new Error("This file is not a saved run.");

  const cards: Record<string, Card | undefined> = {};
  const names: Record<string, string> = {};
  const cardBag = asRecord(root.cards);
  if (cardBag) {
    for (const [communityId, entry] of Object.entries(cardBag)) {
      const row = asRecord(entry);
      if (!row) continue;
      names[communityId] = typeof row.name === "string" && row.name ? row.name : communityId;
      const parsed = CardSchema.safeParse(row.card);
      if (parsed.success) cards[communityId] = parsed.data;
    }
  }

  const messages = root.messages
    .flatMap((item, index) => {
      const message = messageFrom(item, index);
      return message ? [message] : [];
    })
    .sort((a, b) => a.seq - b.seq);

  let deal: Deal | null = null;
  let dealProblem: string | null = null;
  const dealRow = asRecord(root.deal);
  if (dealRow && "deal" in dealRow) {
    const parsed = DealSchema.safeParse(dealRow.deal);
    if (parsed.success) deal = parsed.data;
    else dealProblem = formatZodError(parsed.error);
  }

  const announcements: AnnouncementView[] = Array.isArray(root.announcements)
    ? root.announcements.flatMap((item) => {
        const row = asRecord(item);
        if (!row || typeof row.community_id !== "string" || typeof row.text !== "string") return [];
        return [{ communityId: row.community_id, text: row.text }];
      })
    : [];

  const recorded = Array.isArray(root.approvals)
    ? root.approvals.flatMap((item) => {
        const row = asRecord(item);
        if (!row || typeof row.community_id !== "string") return [];
        return [
          {
            name: names[row.community_id] || row.community_id,
            status: typeof row.status === "string" ? row.status : "pending",
            note: typeof row.note === "string" ? row.note : null,
          },
        ];
      })
    : [];

  return {
    id,
    backend: run && typeof run.backend === "string" ? run.backend : null,
    need: run && typeof run.need === "string" ? run.need : "",
    status: run && typeof run.status === "string" ? run.status : "",
    messages,
    deal,
    dealProblem,
    cards,
    names,
    announcements,
    recorded,
  };
}

export async function loadDemoReplay(): Promise<ReplayData> {
  const base = import.meta.env.BASE_URL || "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const response = await fetch(`${prefix}demo-run.json`);
  if (!response.ok) throw new Error("demo-run.json is not in this app.");
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new Error("demo-run.json is not valid JSON.");
  }
  return replayFromExport(json);
}

export async function loadDbReplay(runId: string): Promise<ReplayData | null> {
  const run = await getRun(runId);
  if (!run) return null;
  const [messages, deals, communities] = await Promise.all([
    listMessages(runId),
    listDeals(runId),
    getCommunities([run.leadId, ...run.partnerIds]),
  ]);
  const chosen = (run.dealId ? deals.find((deal) => deal.id === run.dealId) : undefined) ?? deals[deals.length - 1] ?? null;
  let deal: Deal | null = null;
  let dealProblem: string | null = null;
  if (chosen) {
    const parsed = DealSchema.safeParse(chosen.deal);
    if (parsed.success) deal = parsed.data;
    else dealProblem = formatZodError(parsed.error);
  }
  const announcements = chosen ? await listAnnouncements(chosen.id) : [];
  const cards: Record<string, Card | undefined> = {};
  const names: Record<string, string> = {};
  for (const community of communities) {
    names[community.id] = community.name;
    if (community.card) cards[community.id] = community.card;
  }
  return {
    id: run.id,
    backend: run.backend,
    need: run.need,
    status: run.status,
    messages,
    deal,
    dealProblem,
    cards,
    names,
    announcements,
    recorded: [],
  };
}
