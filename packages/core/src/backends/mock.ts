import type { AskRequest, Backend } from "./types";
import { slugify } from "../card";
import { addDays, allowedDaysForAll, nextAllowedDate } from "../dates";
import { flattenCard } from "../evidence";
import { extractJson } from "../json";
import { CardSchema, type Card, type Deal, type Stance } from "../schemas";

const GUESS = "GUESS: public details are thin";

/**
 * Deterministic offline backend. It reads the data blocks and labelled lines in the
 * prompt (cards, need, TODAY, SUGGESTED DATE, the turn instruction) and never calls the network.
 * Community names come only from the prompt.
 */
export class MockBackend implements Backend {
  readonly name = "mock" as const;
  readonly canBrowse = false;

  ask(request: AskRequest): Promise<string> {
    const task = taskOf(request.prompt);
    if (task === "scout") return Promise.resolve(JSON.stringify(scoutCard(request.prompt)));
    if (task === "match") return Promise.resolve(JSON.stringify(matchCards(request.prompt)));
    if (task === "scribe") return Promise.resolve(JSON.stringify(scribeDeal(request.prompt)));
    if (task === "announce") return Promise.resolve(JSON.stringify(announcement(request)));
    if (task.startsWith("turn:")) return Promise.resolve(JSON.stringify(turnReply(request, task.slice("turn:".length))));
    return Promise.reject(new Error(`Mock backend cannot answer this prompt (${task || "no task"}).`));
  }
}

function taskOf(prompt: string): string {
  const line = prompt.split("\n", 1)[0] ?? "";
  return line.startsWith("TASK: ") ? line.slice("TASK: ".length).trim() : "";
}

function readDataBlocks(text: string): Record<string, string> {
  const blocks: Record<string, string> = {};
  for (const match of text.matchAll(/<data name="([^"]*)">([\s\S]*?)<\/data>/g)) {
    if (!(match[1] in blocks)) blocks[match[1]] = match[2].replace(/<\\\/data/gi, "</data");
  }
  return blocks;
}

function dataString(blocks: Record<string, string>, name: string): string | undefined {
  return blocks[name];
}

function dataJson<T>(blocks: Record<string, string>, name: string): T | undefined {
  const raw = blocks[name];
  if (raw == null || !raw.trim()) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function labelledDate(prompt: string, label: string): string | null {
  const match = new RegExp(`^${label}:\\s*(\\d{4}-\\d{2}-\\d{2})`, "m").exec(prompt);
  return match?.[1] ?? null;
}

function limitWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, max).join(" ");
}

function wordsOf(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
}

/** An offer, tagline, need, or note copied exactly from the card. */
function verbatimPhrase(card: Card, prefer: string[] = []): string | null {
  const fields = [card.tagline, ...card.offers, ...card.needs, card.constraints.notes].filter(
    (value): value is string => typeof value === "string" && value.trim().length >= 3,
  );
  if (fields.length === 0) return null;
  const ranked = fields.map((value) => ({
    value: value.trim(),
    score: prefer.reduce((count, word) => count + (value.toLowerCase().includes(word) ? 1 : 0), 0),
  }));
  ranked.sort((a, b) => b.score - a.score || a.value.localeCompare(b.value));
  return ranked[0]?.value ?? null;
}

function cardFromRules(standingRules: string | undefined): Card | null {
  if (!standingRules) return null;
  const at = standingRules.indexOf("CARD:");
  if (at < 0) return null;
  try {
    const parsed = CardSchema.safeParse(extractJson(standingRules.slice(at + "CARD:".length)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function nameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const slug = decodeURIComponent(parts.at(-1) || parsed.hostname.replace(/^www\./, "").split(".")[0] || "community");
    const words = slug
      .replace(/\.[a-z0-9]+$/i, "")
      .split(/[-_\s]+/)
      .filter(Boolean);
    if (words.length === 0) return "Community";
    return words
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
      .slice(0, 120);
  } catch {
    return "Community";
  }
}

function scoutCard(prompt: string): Record<string, unknown> {
  const blocks = readDataBlocks(prompt);
  const url = dataString(blocks, "url")?.trim() ?? "";
  const hint = dataString(blocks, "nameHint")?.trim();
  const name = hint || nameFromUrl(url);
  return {
    id: slugify(name),
    name,
    tagline: GUESS,
    location: null,
    members: null,
    runs: [],
    offers: [],
    needs: [],
    constraints: { days: [], maxGroupSize: null, notes: null },
    tone: null,
    sourceUrls: url ? [url] : [],
  };
}

function matchCards(prompt: string): unknown[] {
  const blocks = readDataBlocks(prompt);
  const need = dataString(blocks, "need") ?? "";
  const needWords = wordsOf(need);
  const candidates = dataJson<Card[]>(blocks, "candidates") ?? [];
  return candidates
    .map((card) => {
      const phrase = verbatimPhrase(card, needWords);
      const blob = flattenCard(card).toLowerCase();
      const score = needWords.reduce((count, word) => count + (blob.includes(word) ? 1 : 0), 0);
      return { card, phrase, score };
    })
    .filter((row): row is { card: Card; phrase: string; score: number } => row.phrase != null)
    .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id))
    .slice(0, 3)
    .map((row) => ({
      communityId: row.card.id,
      fit: row.score >= 2 ? "strong" : row.score === 1 ? "good" : "weak",
      reasons: [
        {
          claim: row.score > 0 ? "Overlaps the need" : "Listed on the card",
          evidence: row.phrase,
          cardOwnerId: row.card.id,
        },
      ],
      concerns: [],
    }));
}

function instructionOf(prompt: string): string {
  return /^This turn:\s*(.*)$/m.exec(prompt)?.[1] ?? "";
}

function hasConcreteProposal(transcript: string, instruction: string): boolean {
  const hay = `${transcript}\n${instruction}`.toLowerCase();
  return hay.includes("proposal") || hay.includes("split") || /\d{4}-\d{2}-\d{2}/.test(hay);
}

function turnReply(request: AskRequest, step: string): { text: string; stance: Stance; evidence: string | null } {
  const blocks = readDataBlocks(request.prompt);
  const card = cardFromRules(request.standingRules);
  const leadId = dataString(blocks, "leadId")?.trim() ?? "";
  const need = dataString(blocks, "need") ?? "";
  const transcript = dataString(blocks, "transcript") ?? "";
  const instruction = instructionOf(request.prompt);
  const suggested = labelledDate(request.prompt, "SUGGESTED DATE");
  const phrase = card ? verbatimPhrase(card) : null;
  const isLead = card ? card.id === leadId : request.bot === `cb-${leadId}`;
  const draft = readDataBlocks(request.standingRules ?? "").status?.trim() === "draft";
  const unconfirmed = draft && (step === "restate" || step === "offer") ? "Our info is unconfirmed. " : "";

  if (isLead && (step === "propose" || step === "revise")) {
    const venue = card?.location?.trim() || "TBC";
    const brings = card && card.offers.length > 0 ? card.offers.join(", ") : (phrase ?? "support");
    const when = suggested ?? "a shared day";
    return {
      text: limitWords(`${unconfirmed}Proposed split on ${when} at 18:00 at ${venue}. We bring ${brings}.`, 60),
      stance: "offer",
      evidence: phrase,
    };
  }
  if (isLead) {
    return {
      text: limitWords(`${unconfirmed}Restating the need: ${need}`, 60),
      stance: "offer",
      evidence: phrase,
    };
  }
  if (hasConcreteProposal(transcript, instruction)) {
    const when = suggested ? ` on ${suggested}` : "";
    return {
      text: limitWords(`${unconfirmed}We accept this proposal${when}.`, 60),
      stance: "accept",
      evidence: phrase,
    };
  }
  const offer = phrase ?? "time together";
  return {
    text: limitWords(`${unconfirmed}We can bring ${offer}. We want a plan that fits our week.`, 60),
    stance: "offer",
    evidence: phrase,
  };
}

function suggestedFor(prompt: string, cards: Card[]): string {
  const labelled = labelledDate(prompt, "SUGGESTED DATE");
  if (labelled) return labelled;
  const fromBlock = dataString(readDataBlocks(prompt), "suggestedDate")?.trim();
  if (fromBlock && /^\d{4}-\d{2}-\d{2}$/.test(fromBlock)) return fromBlock;
  const today = labelledDate(prompt, "TODAY");
  if (!today) return "";
  const date = nextAllowedDate(
    addDays(today, 14),
    allowedDaysForAll(cards.map((card) => card.constraints.days)),
  );
  return date ?? addDays(today, 14);
}

function scribeDeal(prompt: string): Deal {
  const blocks = readDataBlocks(prompt);
  const cards = dataJson<Card[]>(blocks, "cards") ?? [];
  const leadId = dataString(blocks, "leadId")?.trim() || cards[0]?.id || "";
  const lead = cards.find((card) => card.id === leadId) ?? cards[0];
  const sizes = cards
    .map((card) => card.constraints.maxGroupSize)
    .filter((size): size is number => typeof size === "number" && size > 0);
  const communities = cards.map((card) => ({
    id: card.id,
    name: card.name,
    role: card.id === leadId ? ("host" as const) : ("co-host" as const),
    brings: card.offers.map((offer) => offer.trim()).filter((offer) => offer.length > 0),
  }));
  if (communities.length > 0 && !communities.some((community) => community.role === "host")) {
    communities[0].role = "host";
  }
  const reasons = cards.flatMap((card) => {
    const evidence = verbatimPhrase(card);
    return evidence ? [{ communityId: card.id, evidence }] : [];
  });
  const name = lead?.name ?? "partners";
  return {
    title: `Joint event with ${name}`.slice(0, 120),
    date: suggestedFor(prompt, cards),
    time: "18:00",
    venue: lead?.location?.trim() || "TBC",
    capacity: sizes.length ? Math.min(...sizes) : 20,
    description: "A joint event for the communities that agreed to take part together.",
    communities,
    agenda: [{ time: "18:00", item: "Joint session" }],
    reasons,
    consensus: true,
    status: "pending_approval",
  };
}

function announcement(request: AskRequest): { text: string } {
  const blocks = readDataBlocks(request.prompt);
  const deal = dataJson<Deal>(blocks, "deal");
  const tone = dataString(blocks, "tone")?.trim() || cardFromRules(request.standingRules)?.tone?.trim() || "";
  const title = limitWords(deal?.title ?? "Joint event", 12);
  const date = deal?.date ?? "";
  const toneBit = tone ? `${limitWords(tone, 8)}: ` : "";
  return { text: limitWords(`${toneBit}${title} is on ${date}.`, 50) };
}
