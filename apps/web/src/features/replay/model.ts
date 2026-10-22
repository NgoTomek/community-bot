import { messageDelayMs, type Card, type CommunityStatus } from "@community-bots/core";
import type { Announcement, Community, DealVersion, Message, Run } from "../../data/types";

export interface ReplayCommunity {
  id: string;
  name: string;
  /** Null when the recording does not include the community's card. */
  status: CommunityStatus | null;
}

export interface ReplayMessage {
  message: Message;
  /** Pause before this post at 1x, in ms. */
  delayMs: number;
}

/** "source": the live data source. "file": the bundled demo-run.json. "sample": a fresh mock world. */
export type ReplayOrigin = "source" | "file" | "sample";

export interface ReplayData {
  origin: ReplayOrigin;
  run: Run;
  /** In seq order. */
  messages: ReplayMessage[];
  /** Oldest round first. */
  deals: DealVersion[];
  /** Lead first, then partners. */
  communities: ReplayCommunity[];
  /** Cards of the communities in the run, for evidence checks. */
  cards: Record<string, Card>;
  names: Record<string, string>;
  announcements: Announcement[];
}

/** A loaded replay plus where its links may point. */
export interface ReplayBundle {
  data: ReplayData;
  /** Run to open as a live thread; null when the data source does not have it. */
  threadRunId: string | null;
  /** Deal whose event page the data source can show. */
  eventDealId: string | null;
}

/** A stored delay when it is usable, otherwise the core pacing rule. */
export function delayFor(text: string, stored?: number | null): number {
  return typeof stored === "number" && Number.isFinite(stored) && stored > 0 ? stored : messageDelayMs(text);
}

export function participantIds(run: Pick<Run, "leadId" | "partnerIds">): string[] {
  return [...new Set([run.leadId, ...run.partnerIds].filter(Boolean))];
}

export function sortMessages(messages: ReplayMessage[]): ReplayMessage[] {
  return [...messages].sort((a, b) => a.message.seq - b.message.seq);
}

export function sortDeals(deals: DealVersion[]): DealVersion[] {
  return [...deals].sort((a, b) => a.round - b.round || a.createdAt.localeCompare(b.createdAt));
}

/**
 * Display names for every community the replay mentions: known names first, then the names
 * the deals carry, then the Bot speaker labels.
 */
export function namesFor(input: { ids: string[]; known: Record<string, string>; deals: DealVersion[]; messages: Message[] }): Record<string, string> {
  const names: Record<string, string> = {};
  for (const message of input.messages) {
    if (message.role === "bot" && message.communityId) names[message.communityId] = message.speaker.replace(/ Bot$/, "");
  }
  for (const deal of input.deals) for (const c of deal.deal.communities ?? []) names[c.id] = c.name;
  for (const [id, name] of Object.entries(input.known)) names[id] = name;
  for (const id of input.ids) names[id] ??= id;
  return names;
}

/** Builds a replay from data-source reads. Messages there carry no stored delay, so pacing comes from the text. */
export function replayFromSource(input: { origin: ReplayOrigin; run: Run; messages: Message[]; deals: DealVersion[]; communities: Community[]; announcements?: Announcement[] }): ReplayData {
  const ids = participantIds(input.run);
  const byId = new Map(input.communities.map((c) => [c.id, c]));
  const cards: Record<string, Card> = {};
  const known: Record<string, string> = {};
  for (const id of ids) {
    const community = byId.get(id);
    if (!community) continue;
    cards[id] = community.card;
    known[id] = community.name;
  }
  const messages = sortMessages(input.messages.map((message) => ({ message, delayMs: delayFor(message.text) })));
  const deals = sortDeals(input.deals);
  const names = namesFor({ ids, known, deals, messages: messages.map((m) => m.message) });
  return {
    origin: input.origin,
    run: { ...input.run, typing: null },
    messages,
    deals,
    communities: ids.map((id) => ({ id, name: names[id], status: byId.get(id)?.status ?? null })),
    cards,
    names,
    announcements: input.announcements ?? [],
  };
}
