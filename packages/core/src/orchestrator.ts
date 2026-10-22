import { ZodError } from "zod";
import { askJson } from "./ask";
import type { Backend, FetchedPage } from "./backends/types";
import { botSpeakerName, communityBotName, MATCHMAKER_BOT, organiserSpeakerName, SCOUT_BOT, SCRIBE_BOT } from "./bots";
import { normaliseCard, slugify } from "./card";
import { OrganiserChannel, organiserGuidanceBlock, type HumanPost, type RunControlSource } from "./control";
import { validateDeal } from "./deal";
import { checkEvidence, verifyEvidence } from "./evidence";
import { messageDelayMs } from "./pacing";
import {
  announcePrompt,
  communityStandingRules,
  MATCHMAKER_STANDING_RULES,
  matchmakerPrompt,
  SCOUT_STANDING_RULES,
  SCRIBE_STANDING_RULES,
  scoutPrompt,
  scribePrompt,
  turnPrompt,
  type PromptParticipant,
  type TurnStep,
} from "./prompts";
import {
  AnnouncementReplySchema,
  BotReplySchema,
  formatZodError,
  LIMITS,
  MatchResultSchema,
  type BotReply,
  type Card,
  type ChatMessage,
  type CommunityStatus,
  type Deal,
  type MatchCandidate,
  type Stance,
} from "./schemas";

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
export async function draftCard(input: DraftCardInput): Promise<Card> {
  await input.onProgress?.("drafting card");
  const id = input.nameHint ? slugify(input.nameHint) : undefined;
  return askJson({
    backend: input.backend,
    bot: SCOUT_BOT,
    standingRules: SCOUT_STANDING_RULES,
    prompt: scoutPrompt({
      url: input.url,
      nameHint: input.nameHint,
      pages: input.pages,
      now: input.now,
    }),
    schema: (value) => {
      try {
        return normaliseCard(value, {
          id,
          fallbackName: input.nameHint,
          sourceUrls: [input.url],
        });
      } catch (error) {
        if (error instanceof ZodError) throw new Error(formatZodError(error), { cause: error });
        throw error;
      }
    },
  });
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
export async function matchCommunities(input: MatchInput): Promise<MatchCandidate[]> {
  const byId = new Map<string, Card>([
    [input.lead.card.id, input.lead.card],
    ...input.candidates.map((candidate) => [candidate.card.id, candidate.card] as const),
  ]);
  const ranked = await askJson({
    backend: input.backend,
    bot: MATCHMAKER_BOT,
    standingRules: MATCHMAKER_STANDING_RULES,
    prompt: matchmakerPrompt({
      need: input.need,
      lead: input.lead.card,
      candidates: input.candidates.map((candidate) => candidate.card),
      now: input.now,
    }),
    schema: MatchResultSchema,
  });
  const kept: MatchCandidate[] = [];
  for (const candidate of ranked) {
    const reasons = candidate.reasons.filter((reason) => {
      const card = byId.get(reason.cardOwnerId);
      return Boolean(card && verifyEvidence(reason.evidence, card));
    });
    if (reasons.length === 0) continue;
    kept.push({ ...candidate, reasons });
    if (kept.length === 3) break;
  }
  return kept;
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
  /** Organisers' pause/stop and their posts. Without it the negotiation runs untouched. */
  control?: RunControlSource;
  /** How often to re-check a paused run, in ms. */
  controlPollMs?: number;
}

export interface NegotiationOutcome {
  messages: ChatMessage[];
  /** True only when every partner's final stance is "accept". */
  consensus: boolean;
  /** Lead plus every partner whose final stance is "accept". */
  agreedIds: string[];
  /** Validated deal, or null when no partner agreed or the run was stopped. */
  deal: Deal | null;
  /** One drafted announcement per community in the deal. */
  announcements: { communityId: string; text: string }[];
  /** True when an organiser stopped the run (or left it paused too long). End it as declined. */
  stopped: boolean;
}

const SCRIBE_RETRIES = 3;
const MAX_REPLY_WORDS = 80;

function botReply(value: unknown): BotReply {
  const parsed = BotReplySchema.safeParse(value);
  if (!parsed.success) throw new Error(formatZodError(parsed.error));
  const words = parsed.data.text.trim().split(/\s+/).length;
  if (words > MAX_REPLY_WORDS) throw new Error(`text has ${words} words; use at most 60`);
  return { ...parsed.data, evidence: parsed.data.evidence?.trim() || null };
}

/**
 * Message 0 is the organiser's need. The lead restates it, each partner offers, the lead
 * proposes a split, each partner answers; if anyone did not accept, the lead revises once and
 * the partners still in answer once more. At most 12 Bot messages. Before every turn the
 * organisers get their say through the OrganiserChannel: pause, stop, guidance, or speaking
 * for a community. Then the Scribe compiles the deal and each community's Bot announces it.
 */
export async function runNegotiation(input: NegotiationInput): Promise<NegotiationOutcome> {
  const { backend, lead, partners, need, now } = input;
  if (partners.length < 1 || partners.length > LIMITS.maxPartners) {
    throw new Error(`A negotiation needs 1 to ${LIMITS.maxPartners} partners.`);
  }
  const everyone = [lead, ...partners];
  const byId = new Map(everyone.map((p) => [p.card.id, p]));
  const participants: PromptParticipant[] = everyone.map(({ card, status }) => ({
    id: card.id,
    name: card.name,
    status,
    days: card.constraints.days,
    maxGroupSize: card.constraints.maxGroupSize,
  }));

  const messages: ChatMessage[] = [];
  // What the Bots see: every message plus organiser posts (which are already in the database).
  const transcript: ChatMessage[] = [];
  let botMessages = 0;

  const emit = async (message: Omit<ChatMessage, "seq" | "delayMs">) => {
    const full = { ...message, seq: messages.length, delayMs: messageDelayMs(message.text) };
    messages.push(full);
    transcript.push(full);
    await input.onMessage?.(full);
  };

  const onPost = (post: HumanPost) => {
    const spokenFor = post.asCommunity ? byId.get(post.asCommunity) : undefined;
    transcript.push({
      seq: transcript.length,
      speaker: spokenFor ? organiserSpeakerName(spokenFor.card.name) : "Organiser",
      communityId: post.asCommunity ?? lead.card.id,
      role: "human",
      text: post.text,
      stance: null,
      evidence: null,
      delayMs: 0,
    });
  };
  const channel = new OrganiserChannel(input.control, { onPost, pollMs: input.controlPollMs });

  const stopped = async (): Promise<NegotiationOutcome> => {
    await input.onTyping?.(null);
    return { messages, consensus: false, agreedIds: [lead.card.id], deal: null, announcements: [], stopped: true };
  };

  /** One turn: the Bot's reply, or its organiser's words. "stopped" ends the run; "cap" ends the talking. */
  const turn = async (who: Participant, step: TurnStep): Promise<Stance | "stopped" | "cap"> => {
    const decision = await channel.beforeTurn(who.card.id);
    if (decision.kind === "stop") return "stopped";
    if (decision.kind === "human") return decision.stance;
    if (botMessages >= LIMITS.maxBotMessages) return "cap";

    await input.onTyping?.(who.card.id);
    const prompt =
      turnPrompt({ runId: input.runId, need, leadId: lead.card.id, participants, messages: transcript, step, now }) +
      organiserGuidanceBlock(decision.guidance);
    const reply = await askJson({
      backend,
      bot: communityBotName(who.card.id),
      standingRules: communityStandingRules(who.card, who.status),
      prompt,
      schema: botReply,
    });
    botMessages++;
    await emit({
      speaker: botSpeakerName(who.card.name),
      communityId: who.card.id,
      role: "bot",
      text: reply.text,
      stance: reply.stance,
      evidence: checkEvidence(reply.evidence, who.card),
    });
    await input.onTyping?.(null);
    return reply.stance;
  };

  await input.onPhase?.("negotiating");
  await emit({ speaker: organiserSpeakerName(lead.card.name), communityId: lead.card.id, role: "human", text: need, stance: null, evidence: null });

  const finalStance = new Map<string, Stance>();
  const stillIn = () => partners.filter((p) => finalStance.get(p.card.id) !== "decline");
  let capped = false;

  const answerRound = async (step: TurnStep): Promise<"stopped" | void> => {
    for (const partner of stillIn()) {
      const stance = await turn(partner, step);
      if (stance === "stopped") return "stopped";
      if (stance === "cap") {
        capped = true;
        return;
      }
      finalStance.set(partner.card.id, stance);
    }
  };

  const restate = await turn(lead, "restate");
  if (restate === "stopped") return stopped();
  for (const partner of partners) {
    const stance = await turn(partner, "offer");
    if (stance === "stopped") return stopped();
    if (stance === "decline") finalStance.set(partner.card.id, "decline");
  }
  if ((await turn(lead, "propose")) === "stopped") return stopped();
  if ((await answerRound("answer")) === "stopped") return stopped();

  const objections = stillIn().some((p) => finalStance.get(p.card.id) !== "accept");
  if (objections && !capped) {
    const revise = await turn(lead, "revise");
    if (revise === "stopped") return stopped();
    if (revise !== "cap" && (await answerRound("reanswer")) === "stopped") return stopped();
  }

  const consensus = partners.every((p) => finalStance.get(p.card.id) === "accept");
  const agreedIds = [lead.card.id, ...partners.filter((p) => finalStance.get(p.card.id) === "accept").map((p) => p.card.id)];
  if (agreedIds.length < 2) {
    await input.onTyping?.(null);
    return { messages, consensus, agreedIds, deal: null, announcements: [], stopped: false };
  }

  if ((await channel.checkpoint()) === "stop") return stopped();
  await input.onPhase?.("compiling");
  const agreed = agreedIds.map((id) => byId.get(id)!);
  const deal = await compileDeal({ input, agreed, transcript, consensus });

  if ((await channel.checkpoint()) === "stop") return stopped();
  const announcements: NegotiationOutcome["announcements"] = [];
  for (const community of deal.communities) {
    const participant = byId.get(community.id)!;
    const { text } = await askJson({
      backend,
      bot: communityBotName(community.id),
      standingRules: communityStandingRules(participant.card, participant.status),
      prompt: announcePrompt({
        communityName: participant.card.name,
        communityId: community.id,
        deal,
        tone: participant.card.tone,
      }),
      schema: AnnouncementReplySchema,
    });
    announcements.push({ communityId: community.id, text });
  }

  if ((await channel.checkpoint()) === "stop") return stopped();
  return { messages, consensus, agreedIds, deal, announcements, stopped: false };
}

/** Asks the Scribe for the deal and validates it in code, retrying up to 3 times with the errors fed back. */
async function compileDeal(args: {
  input: NegotiationInput;
  agreed: Participant[];
  transcript: ChatMessage[];
  consensus: boolean;
}): Promise<Deal> {
  const { input, agreed, transcript, consensus } = args;
  const cards = agreed.map((p) => p.card);
  const basePrompt = scribePrompt({
    runId: input.runId,
    need: input.need,
    consensus,
    leadId: input.lead.card.id,
    cards,
    messages: transcript,
    now: input.now,
  });

  let errors: string[] = [];
  for (let attempt = 0; attempt <= SCRIBE_RETRIES; attempt++) {
    const prompt = errors.length
      ? `${basePrompt}\n\nYour previous deal was rejected: ${errors.join("; ")}. Fix these and reply with the full deal JSON only.`
      : basePrompt;
    const raw = await askJson({
      backend: input.backend,
      bot: SCRIBE_BOT,
      standingRules: SCRIBE_STANDING_RULES,
      prompt,
      schema: (value: unknown) => value,
    });
    const candidate = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>), consensus } : raw;
    const checked = validateDeal(candidate, { cards, leadId: input.lead.card.id, now: input.now });
    if (checked.ok) return checked.deal;
    errors = checked.errors;
  }
  throw new Error(`The Scribe could not produce a valid deal after ${SCRIBE_RETRIES} retries: ${errors.join("; ")}`);
}
