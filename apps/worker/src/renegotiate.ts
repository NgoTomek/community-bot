import {
  BotReplySchema,
  DealSchema,
  STOPPED_BY_ORGANISER,
  checkEvidence,
  communityStandingRules,
  messageDelayMs,
  organiserGuidanceBlock,
  scribePrompt,
  turnPrompt,
  validateDeal,
  type ChatMessage,
  type Deal,
  type Stance,
  type TurnStep,
  OrganiserChannel,
  SCRIBE_BOT,
  SCRIBE_STANDING_RULES,
  botSpeakerName,
  communityBotName,
  organiserSpeakerName,
} from "@community-bots/core";
import type { Backend } from "@community-bots/core/backends";
import type { SupabaseClient } from "@supabase/supabase-js";
import { askValidated } from "./ask";
import { createRunControl } from "./runControl";
import {
  insertDeal,
  insertMessage,
  listApprovals,
  listMessages,
  loadCommunity,
  loadDeal,
  loadRun,
  markRunError,
  retargetApprovals,
  updateRunWhere,
  type CommunityRecord,
  type MessageRecord,
  type RunRecord,
} from "./db";
import { readableError } from "./errors";

const inflight = new Set<string>();

export class LeaveRun extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeaveRun";
  }
}

/**
 * An organiser post stored after the current deal went out (while responses were pending).
 * No round has read it yet, so the OrganiserChannel feeds it to this round as guidance or as
 * that community's reply. The worker's own "asked for changes" notes never count.
 */
export function isUnseenPost(
  row: Pick<MessageRecord, "role" | "text" | "created_at">,
  roundStartedAt: string | null,
  workerNotes: ReadonlySet<string>,
): boolean {
  if (row.role !== "human" || !roundStartedAt || workerNotes.has(row.text)) return false;
  return Date.parse(row.created_at) > Date.parse(roundStartedAt);
}

export type RenegotiateOutcome =
  | { kind: "done"; dealId: string; round: number; consensus: boolean }
  | { kind: "skipped" }
  | { kind: "stopped" };

function toChat(row: MessageRecord): ChatMessage {
  return {
    seq: row.seq,
    speaker: row.speaker,
    communityId: row.community_id,
    role: row.role,
    text: row.text,
    stance: row.stance,
    evidence: row.evidence,
    delayMs: row.delay_ms,
  };
}

async function setTyping(client: SupabaseClient, runId: string, typing: string | null): Promise<void> {
  const { error } = await client.from("runs").update({ typing }).eq("id", runId);
  if (error) console.error(`typing: ${readableError(new Error(error.message))}`);
}

async function compileDeal(opts: {
  backend: Backend;
  run: RunRecord;
  cards: CommunityRecord[];
  transcript: ChatMessage[];
  consensus: boolean;
}): Promise<Deal> {
  const cards = opts.cards.map((community) => community.card);
  const base = scribePrompt({
    runId: opts.run.id,
    need: opts.run.need,
    consensus: opts.consensus,
    leadId: opts.run.lead_id,
    cards,
    messages: opts.transcript,
  });
  let errors: string[] = [];
  for (let attempt = 0; attempt <= 3; attempt++) {
    const prompt = errors.length
      ? `${base}\n\nYour previous deal was rejected: ${errors.join("; ")}. Fix these and reply with the full deal JSON only.`
      : base;
    let raw: unknown;
    try {
      raw = await askValidated({
        backend: opts.backend,
        bot: SCRIBE_BOT,
        standingRules: SCRIBE_STANDING_RULES,
        prompt,
        schema: (value: unknown) => value,
        retries: 0,
      });
    } catch (error) {
      errors = [readableError(error)];
      continue;
    }
    const candidate = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>), consensus: opts.consensus } : raw;
    const checked = validateDeal(candidate, { cards, leadId: opts.run.lead_id });
    if (checked.ok) return checked.deal;
    errors = checked.errors;
  }
  throw new Error(`The Scribe could not produce a valid deal: ${errors.join("; ") || "no deal"}`);
}

/**
 * One more round: organiser notes go in as human messages (data, not instructions),
 * the lead revises, partners accept or counter, and the scribe writes a new deal row.
 */
async function revise(opts: {
  client: SupabaseClient;
  backend: Backend;
  run: RunRecord;
  onProgress?: (text: string) => Promise<void>;
}): Promise<{ dealId: string; round: number; consensus: boolean } | "stopped"> {
  const { client, backend, run } = opts;
  const lead = await loadCommunity(client, run.lead_id);
  if (!lead) throw new Error(`Lead community ${run.lead_id} was not found`);
  const partners: CommunityRecord[] = [];
  for (const id of run.partner_ids) {
    const partner = await loadCommunity(client, id);
    if (!partner) throw new Error(`Partner community ${id} was not found`);
    partners.push(partner);
  }
  const everyone = [lead, ...partners];
  const participants = everyone.map((community) => ({
    id: community.id,
    name: community.name,
    status: community.status,
    days: community.card.constraints.days,
    maxGroupSize: community.card.constraints.maxGroupSize,
  }));

  await opts.onProgress?.("Reading the notes");
  const notes: { communityId: string; name: string; text: string }[] = [];
  for (const approval of await listApprovals(client, run.id)) {
    if (approval.status !== "renegotiate") continue;
    const note = approval.note?.trim();
    if (!note) continue;
    const known = everyone.find((community) => community.id === approval.community_id);
    const loaded = known ?? (await loadCommunity(client, approval.community_id));
    const name = loaded?.name ?? approval.community_id;
    notes.push({ communityId: approval.community_id, name, text: `The organiser of ${name} asked for changes: ${note}` });
  }
  const noteTexts = new Set(notes.map((note) => note.text));
  const roundStartedAt = run.deal_id ? ((await loadDeal(client, run.deal_id))?.created_at ?? null) : null;

  const control = createRunControl(client, run.id);
  const transcript: ChatMessage[] = [];
  for (const row of await listMessages(client, run.id)) {
    if (isUnseenPost(row, roundStartedAt, noteTexts)) continue;
    if (row.role === "human") control.ignore(row.id);
    transcript.push(toChat(row));
  }
  const channel = new OrganiserChannel(control, {
    onPost(post) {
      const spokenFor = post.asCommunity ? everyone.find((community) => community.id === post.asCommunity) : undefined;
      transcript.push({
        seq: transcript.length,
        speaker: spokenFor ? organiserSpeakerName(spokenFor.name) : "Organiser",
        communityId: post.asCommunity ?? run.lead_id,
        role: "human",
        text: post.text,
        stance: null,
        evidence: null,
        delayMs: messageDelayMs(post.text),
      });
    },
  });

  const speak = async (who: CommunityRecord, step: TurnStep): Promise<Stance | "stopped"> => {
    const decision = await channel.beforeTurn(who.id);
    if (decision.kind === "stop") return "stopped";
    if (decision.kind === "human") return decision.stance;
    await setTyping(client, run.id, who.id);
    const prompt =
      turnPrompt({
        runId: run.id,
        need: run.need,
        leadId: run.lead_id,
        participants,
        messages: transcript,
        step,
      }) + organiserGuidanceBlock(decision.guidance);
    const reply = await askValidated({
      backend,
      bot: communityBotName(who.id),
      standingRules: communityStandingRules(who.card, who.status),
      prompt,
      schema: BotReplySchema,
    });
    const message: ChatMessage = {
      seq: transcript.length,
      speaker: botSpeakerName(who.name),
      communityId: who.id,
      role: "bot",
      text: reply.text,
      stance: reply.stance,
      evidence: checkEvidence(reply.evidence, who.card),
      delayMs: messageDelayMs(reply.text),
    };
    await insertMessage(client, run.id, message);
    transcript.push(message);
    await setTyping(client, run.id, null);
    return reply.stance;
  };

  for (const { communityId, name, text } of notes) {
    if (transcript.some((message) => message.text === text)) continue;
    const message: ChatMessage = {
      seq: transcript.length,
      speaker: organiserSpeakerName(name),
      communityId,
      role: "human",
      text,
      stance: null,
      evidence: null,
      delayMs: messageDelayMs(text),
    };
    const id = await insertMessage(client, run.id, message);
    control.ignore(id);
    transcript.push(message);
  }

  await opts.onProgress?.("Revising the deal");
  if ((await speak(lead, "revise")) === "stopped") return "stopped";
  const partnerStances: Stance[] = [];
  for (const partner of partners) {
    const stance = await speak(partner, "reanswer");
    if (stance === "stopped") return "stopped";
    partnerStances.push(stance);
  }
  const consensus = partners.length > 0 && partnerStances.every((stance) => stance === "accept");

  if ((await channel.checkpoint()) === "stop") return "stopped";
  await opts.onProgress?.("Writing the deal");
  await updateRunWhere(client, run.id, { status: "compiling", typing: null }, ["negotiating"]);

  const deal = DealSchema.parse(await compileDeal({ backend, run, cards: everyone, transcript, consensus }));
  if ((await channel.checkpoint()) === "stop") return "stopped";

  const nextRound = run.round + 1;
  const dealId = await insertDeal(client, { runId: run.id, deal, round: nextRound });
  await retargetApprovals(client, run.id, dealId, nextRound);
  const saved = await updateRunWhere(
    client,
    run.id,
    {
      status: "pending_approval",
      deal_id: dealId,
      round: nextRound,
      consensus,
      typing: null,
      error: null,
      decline_reason: null,
    },
    ["negotiating", "compiling"],
  );
  if (!saved) {
    const current = await loadRun(client, run.id);
    if (current?.status === "declined") return "stopped";
    throw new Error("Could not save the revised deal");
  }
  return { dealId, round: nextRound, consensus };
}

export async function renegotiateRun(opts: {
  client: SupabaseClient;
  backend: Backend;
  runId: string;
  /** A queued renegotiate job may resume a run already in `negotiating`. The approval poll must not. */
  allowInProgress?: boolean;
  onProgress?: (text: string) => Promise<void>;
}): Promise<RenegotiateOutcome> {
  if (inflight.has(opts.runId)) return { kind: "skipped" };
  inflight.add(opts.runId);
  try {
    const run = await loadRun(opts.client, opts.runId);
    if (!run) throw new LeaveRun("Run not found");
    if (run.status !== "pending_approval" && run.status !== "negotiating") {
      throw new LeaveRun(`Cannot renegotiate this run while it is ${run.status}`);
    }
    if (run.status === "pending_approval") {
      const won = await updateRunWhere(
        opts.client,
        run.id,
        { status: "negotiating", typing: null, error: null },
        ["pending_approval"],
      );
      if (!won) return { kind: "skipped" };
    } else if (!opts.allowInProgress) {
      return { kind: "skipped" };
    }
    try {
      const revised = await revise({ ...opts, run });
      if (revised === "stopped") {
        await updateRunWhere(
          opts.client,
          run.id,
          { status: "declined", decline_reason: STOPPED_BY_ORGANISER, typing: null },
          ["negotiating", "compiling", "pending_approval"],
        );
        return { kind: "stopped" };
      }
      return { kind: "done", ...revised };
    } catch (error) {
      await markRunError(opts.client, run.id, readableError(error));
      throw error;
    }
  } finally {
    inflight.delete(opts.runId);
  }
}
