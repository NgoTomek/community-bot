import type { Backend, FetchedPage } from "./backends/types";
import type { Card, ChatMessage, CommunityStatus, Deal, MatchCandidate } from "./schemas";

/** A community taking part, with its card and whether the organiser confirmed it. */
export interface Participant {
  card: Card;
  status: CommunityStatus;
}

// ---------------------------------------------------------------------------
// Scout: draft a card from public pages
// ---------------------------------------------------------------------------

export interface DraftCardInput {
  backend: Backend;
  url: string;
  /** Display name hint (e.g. from seed/communities.json). When set, the id is slugify(nameHint). */
  nameHint?: string;
  /** Pages fetched by the worker when the backend cannot browse (openai). Ignored by grokbot. */
  pages?: FetchedPage[];
  now?: Date;
  onProgress?: (text: string) => void | Promise<void>;
}

/** Asks the Scout Bot for a card and returns it normalised and validated (status is decided by the caller). */
export async function draftCard(_input: DraftCardInput): Promise<Card> {
  throw new Error("draftCard: not implemented yet");
}

// ---------------------------------------------------------------------------
// Matchmaker: rank other communities for a need
// ---------------------------------------------------------------------------

export interface MatchInput {
  backend: Backend;
  lead: Participant;
  need: string;
  candidates: Participant[];
  now?: Date;
}

/**
 * Top 3 candidates. Reasons whose evidence is not verbatim on the named card are dropped,
 * and candidates left with no verified reason are dropped.
 */
export async function matchCommunities(_input: MatchInput): Promise<MatchCandidate[]> {
  throw new Error("matchCommunities: not implemented yet");
}

// ---------------------------------------------------------------------------
// Negotiation: group chat between Community Bots, then Scribe and announcements
// ---------------------------------------------------------------------------

export type NegotiationPhase = "negotiating" | "compiling";

export interface NegotiationInput {
  backend: Backend;
  runId: string;
  need: string;
  lead: Participant;
  /** Partners in speaking order (1 to 3). */
  partners: Participant[];
  now?: Date;
  /** Called with each message as soon as it exists, starting with seq 0 (the organiser's need). */
  onMessage?: (message: ChatMessage) => void | Promise<void>;
  /** Called with the community id whose Bot is about to speak, or null when nobody is. */
  onTyping?: (communityId: string | null) => void | Promise<void>;
  onPhase?: (phase: NegotiationPhase) => void | Promise<void>;
}

export interface NegotiationOutcome {
  messages: ChatMessage[];
  /** True only when every partner's final stance is "accept". */
  consensus: boolean;
  /** Lead plus every partner whose final stance is "accept". */
  agreedIds: string[];
  /** Validated deal, or null when no partner agreed. */
  deal: Deal | null;
  /** One drafted announcement per community in the deal. */
  announcements: { communityId: string; text: string }[];
}

export async function runNegotiation(_input: NegotiationInput): Promise<NegotiationOutcome> {
  throw new Error("runNegotiation: not implemented yet");
}
