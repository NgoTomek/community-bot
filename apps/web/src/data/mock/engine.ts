/**
 * The mock negotiation engine. Deterministic and generic: every sentence is built from the
 * cards, the need and what humans said. No community or scenario is named in this file.
 *
 * The engine is a pure function of the run state: `nextAction(state)` says what should happen
 * next (a Bot post, or compiling the deal). The mock data source applies actions on a timer.
 */
import {
  addDays,
  allowedDaysForAll,
  DAYS,
  dayOfWeek,
  GUESS_PREFIX,
  nextAllowedDate,
  todayIso,
  type Card,
  type Day,
  type Deal,
  type DealRole,
  type Stance,
} from "@community-bots/core";
import { hashString } from "../../lib/color";
import { DAY_NAMES } from "../../lib/constraints";
import { joinNames, shortDate } from "../../lib/format";
import { categorize, type WallCategory } from "../../lib/wall";

export interface EngineCommunity {
  id: string;
  name: string;
  status: "draft" | "confirmed";
  card: Card;
}

export interface EngineMessage {
  seq: number;
  role: "human" | "bot";
  /** Bot: the community it speaks for. Human: the community they speak for, or "". */
  communityId: string;
  text: string;
  stance: Stance | null;
  at: number;
  round: number;
  /** Plan step this message fulfilled (a human speaking for a community can take a Bot's turn). */
  step: string | null;
}

export interface RenegotiationRequest {
  at: number;
  /** The round whose deal was sent back. */
  round: number;
  communityId: string;
  note: string;
}

export interface EngineState {
  leadId: string;
  partnerIds: string[];
  need: string;
  round: number;
  communities: Record<string, EngineCommunity>;
  messages: EngineMessage[];
  /** Rounds whose deal has been compiled, with the time it happened. */
  compiled: Record<number, number>;
  requests: RenegotiationRequest[];
  now: Date;
}

export interface Terms {
  date: string;
  time: string;
  hostId: string;
  venue: string;
  capacity: number;
  extras: string[];
}

export type Action =
  | { type: "bot"; step: string | null; communityId: string; stance: Stance | null; text: string; evidence: string | null }
  | { type: "compile"; round: number; deal: Deal };

// ---------------------------------------------------------------------------
// Small text helpers
// ---------------------------------------------------------------------------

export const stripGuess = (s: string) => (s.startsWith(GUESS_PREFIX) ? s.slice(GUESS_PREFIX.length) : s);

/** Lower-cases the first letter unless the word looks like an acronym or a name. */
export function lc(text: string): string {
  const s = stripGuess(text).trim();
  if (s.length < 2) return s.toLowerCase();
  const firstWord = s.split(/\s+/)[0];
  if (/[A-Z].*[A-Z]/.test(firstWord) || /\d/.test(firstWord)) return s;
  if (s[1] === s[1].toUpperCase() && /[a-z]/i.test(s[1])) return s;
  return s[0].toLowerCase() + s.slice(1);
}

const sentence = (s: string) => {
  const t = s.trim().replace(/[.!?:;,\s]+$/, "");
  return t;
};

function truncateWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= max ? text.trim() : `${words.slice(0, max).join(" ")}…`;
}

function pick<T>(items: T[], seed: string): T {
  return items[hashString(seed) % items.length];
}

const CATEGORY_ASK: Record<WallCategory, string> = {
  space: "a space",
  speakers: "speakers or mentors",
  audience: "an audience",
  sponsorship: "sponsorship",
};

const toMinutes = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 18 * 60 + 30;
};
const fromMinutes = (minutes: number) => {
  const m = Math.max(0, Math.min(23 * 60 + 59, minutes));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const roundTo5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function card(state: EngineState, id: string): Card {
  const c = state.communities[id];
  if (!c) throw new Error(`Unknown community ${id}`);
  return c.card;
}

function name(state: EngineState, id: string): string {
  return state.communities[id]?.name ?? id;
}

export function needCategories(need: string): WallCategory[] {
  return categorize(need);
}

/** The offer on a card that best serves the need (first match), else the first offer. */
export function relevantOffer(c: Card, categories: WallCategory[], prefer?: WallCategory): string | null {
  const offers = c.offers;
  if (offers.length === 0) return null;
  if (prefer) {
    const hit = offers.find((o) => categorize(o).includes(prefer));
    if (hit) return stripGuess(hit);
  }
  const hit = offers.find((o) => categorize(o).some((cat) => categories.includes(cat)));
  return stripGuess(hit ?? offers[0]);
}

function hasCategory(c: Card, category: WallCategory): boolean {
  return c.offers.some((o) => categorize(o).includes(category));
}

/** Rough group size asked for in a need ("for 40 people", "60 founders"). */
export function requestedCapacity(text: string): number | null {
  const patterns = [
    /\b(\d{1,4})\s*(?:people|persons|guests|attendees|participants|beginners|students|founders|members|learners|seats|ppl)\b/i,
    /\b(?:for|of|up to|about|around|roughly|~)\s*(\d{1,4})\b/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const n = Number(m[1]);
      if (n >= 5 && n <= 1000) return n;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Participants and terms
// ---------------------------------------------------------------------------

const DECLINE_WORDS = /\b(decline|pull out|withdraw|can'?t join|cannot join|won'?t join|count us out|sit this one out)\b/i;

/** Partners still in: their days overlap with everyone before them, and no human pulled them out. */
export function activePartners(state: EngineState): string[] {
  const dayLists: Day[][] = [card(state, state.leadId).constraints.days];
  const active: string[] = [];
  for (const id of state.partnerIds) {
    if (!state.communities[id]) continue;
    const days = card(state, id).constraints.days;
    if (allowedDaysForAll([...dayLists, days]).length === 0) continue;
    if (state.messages.some((m) => m.role === "human" && m.communityId === id && DECLINE_WORDS.test(m.text))) continue;
    dayLists.push(days);
    active.push(id);
  }
  return active;
}

export function participants(state: EngineState): string[] {
  return [state.leadId, ...activePartners(state)];
}

function allowedDays(state: EngineState, ids: string[]): Day[] {
  const allowed = allowedDaysForAll(ids.map((id) => card(state, id).constraints.days));
  return allowed.length ? allowed : [...DAYS];
}

function maxCapacity(state: EngineState, ids: string[]): number | null {
  const caps = ids.map((id) => card(state, id).constraints.maxGroupSize).filter((n): n is number => n !== null);
  return caps.length ? Math.min(...caps) : null;
}

function pickHost(state: EngineState, ids: string[]): string {
  const withSpace = ids.filter((id) => hasCategory(card(state, id), "space"));
  if (withSpace.length === 0) return state.leadId;
  const size = (id: string) => card(state, id).constraints.maxGroupSize ?? 60;
  return [...withSpace].sort((a, b) => size(b) - size(a) || ids.indexOf(a) - ids.indexOf(b))[0];
}

function venueFor(state: EngineState, hostId: string): string {
  const c = card(state, hostId);
  if (!hasCategory(c, "space")) return `Venue to be confirmed by ${name(state, hostId)}`;
  const location = c.location ? stripGuess(c.location) : null;
  return location ? `${name(state, hostId)}, ${location}` : `${name(state, hostId)}'s space`;
}

export function baseTerms(state: EngineState): Terms {
  const ids = participants(state);
  const allowed = allowedDays(state, ids);
  const start = addDays(todayIso(state.now), 21);
  const date = nextAllowedDate(start, allowed) ?? start;
  const weekend = dayOfWeek(date) === "Sat" || dayOfWeek(date) === "Sun";
  const hostId = pickHost(state, ids);
  return {
    date,
    time: weekend ? "11:00" : "18:30",
    hostId,
    venue: venueFor(state, hostId),
    capacity: requestedCapacity(state.need) ?? 40,
    extras: [],
  };
}

interface RequestCtx {
  state: EngineState;
  ids: string[];
  allowed: Day[];
  maxCap: number | null;
}

const DAY_PATTERNS: [Day, RegExp][] = [
  ["Mon", /\bmon(day)?s?\b/i],
  ["Tue", /\btues?(day)?s?\b/i],
  ["Wed", /\bwed(nesday)?s?\b/i],
  ["Thu", /\bthu(rs)?(day)?s?\b/i],
  ["Fri", /\bfri(day)?s?\b/i],
  ["Sat", /\bsat(urday)?s?\b/i],
  ["Sun", /\bsun(day)?s?\b/i],
];

function closestDay(fromIso: string, day: Day, earliest: string): string {
  const back = nextAllowedDate(addDays(fromIso, -3), [day]) ?? fromIso;
  return back > earliest ? back : (nextAllowedDate(addDays(earliest, 1), [day]) ?? fromIso);
}

/**
 * Applies one human request (a steer or a renegotiation note) to the terms.
 * Returns the new terms and a short summary of what changed (null when nothing did).
 */
export function applyRequest(terms: Terms, text: string, ctx: RequestCtx): { terms: Terms; summary: string | null } {
  const next: Terms = { ...terms, extras: [...terms.extras] };
  const changes: string[] = [];
  const t = text.toLowerCase().replace(/[\u2018\u2019]/g, "'");
  const earliest = addDays(todayIso(ctx.state.now), 7);

  // A named weekday wins over a generic "different date".
  const namedDay = DAY_PATTERNS.find(([, re]) => re.test(t))?.[0] ?? null;
  if (namedDay) {
    if (ctx.allowed.includes(namedDay)) {
      const date = closestDay(next.date, namedDay, earliest);
      if (date !== next.date) {
        next.date = date;
        changes.push(`moved to ${shortDate(date)}`);
      }
    } else {
      const blockers = ctx.ids.filter((id) => {
        const days = card(ctx.state, id).constraints.days;
        return days.length > 0 && !days.includes(namedDay);
      });
      changes.push(`${DAY_NAMES[namedDay]} is out because ${joinNames(blockers.map((id) => name(ctx.state, id)))} can't do it`);
    }
  } else if (
    /\b(can'?t|cannot|can not|won'?t|doesn'?t|does not|don'?t)\b[^.?!]*\b(date|day|week|then|make it)\b/.test(t) ||
    /\b(another|different|other|new) (date|day)\b/.test(t) ||
    /\b(move|push|shift)\b[^.?!]*\b(week|later|back)\b/.test(t)
  ) {
    const date = nextAllowedDate(addDays(next.date, 1), ctx.allowed);
    if (date && date !== next.date) {
      next.date = date;
      changes.push(`moved to ${shortDate(date)}`);
    }
  }

  const clock = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(t) ?? /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(t);
  if (clock) {
    let hours = Number(clock[1]);
    const minutes = Number(clock[2] ?? 0);
    if (clock[3] === "pm" && hours < 12) hours += 12;
    if (clock[3] === "am" && hours === 12) hours = 0;
    const time = fromMinutes(hours * 60 + minutes);
    if (time !== next.time) {
      next.time = time;
      changes.push(`starts at ${time}`);
    }
  } else if (/\bearlier\b/.test(t) && !/\bearlier (date|day|week)\b/.test(t)) {
    next.time = fromMinutes(toMinutes(next.time) - 60);
    changes.push(`starts at ${next.time}`);
  } else if (/\blater\b/.test(t) && !/\blater (date|day|week)\b/.test(t) && !changes.length) {
    next.time = fromMinutes(toMinutes(next.time) + 60);
    changes.push(`starts at ${next.time}`);
  }

  const under = /\b(?:under|below|fewer than|less than)\s+(\d{1,4})\b/.exec(t);
  const cap = /\b(?:max(?:imum)?(?: of)?|cap(?:ped)?(?: (?:it|at|to))*|limit(?: (?:it|to|of))*|no more than|at most|up to|keep it(?: to| at)?)\s+(\d{1,4})\b/.exec(t);
  const raise = /\b(?:at least|bigger|more|increase(?: it)? to|raise(?: it)? to)\s+(?:than\s+)?(\d{1,4})\b/.exec(t);
  let wanted: number | null = null;
  if (under) {
    const n = Number(under[1]);
    wanted = n % 5 === 0 ? n - 5 : n - 1;
  } else if (cap) {
    wanted = Number(cap[1]);
  } else if (raise) {
    wanted = Number(raise[1]);
  } else if (/\b(smaller|fewer people|too big|more intimate)\b/.test(t) && !/\b(smaller|bigger) (space|venue|room)\b/.test(t)) {
    wanted = roundTo5(next.capacity * 0.75);
  }
  if (wanted !== null && wanted >= 2 && wanted !== next.capacity) {
    let n = wanted;
    let note = "";
    if (ctx.maxCap !== null && n > ctx.maxCap) {
      n = ctx.maxCap;
      note = `, the most every group allows`;
    }
    if (n !== next.capacity) {
      changes.push(n < next.capacity ? `capped at ${n} people${note}` : `raised to ${n} people${note}`);
      next.capacity = n;
    }
  }

  if (/\b(bigger|larger)\s+(space|venue|room|hall)\b|\bmore room\b/.test(t)) {
    const size = (id: string) => card(ctx.state, id).constraints.maxGroupSize ?? 60;
    const options = ctx.ids.filter((id) => id !== next.hostId && hasCategory(card(ctx.state, id), "space") && size(id) > size(next.hostId));
    if (options.length) {
      const host = options.sort((a, b) => size(b) - size(a))[0];
      next.hostId = host;
      next.venue = venueFor(ctx.state, host);
      changes.push(`moved to ${name(ctx.state, host)}'s space`);
    } else {
      changes.push(`nobody in this collab has a bigger space, so ${next.venue} stays`);
    }
  }

  const add = /\badd(?:ing)?\s+(?:an?\s+|some\s+|the\s+)?([a-z][a-z&' -]{2,40}?)(?=[.,!?]|$| to | at | for )/i.exec(text);
  if (add) {
    const item = add[1].trim().replace(/^\w/, (ch) => ch.toUpperCase());
    if (!next.extras.includes(item)) {
      next.extras.push(item);
      changes.push(`added "${item}" to the agenda`);
    }
  }

  return { terms: next, summary: changes.length ? changes.join("; ") : null };
}

interface TermsTrace {
  terms: Terms;
  /** Summary per human message seq / request time, for acknowledgements. */
  effects: Map<string, string | null>;
}

/** Terms at a moment: base terms, every human request up to `at` applied in order, then capped if the lead revised. */
export function termsAt(state: EngineState, at: number, opts: { capped: boolean }): TermsTrace {
  const ids = participants(state);
  const ctx: RequestCtx = { state, ids, allowed: allowedDays(state, ids), maxCap: maxCapacity(state, ids) };
  const requests: { key: string; at: number; text: string }[] = [
    ...state.messages.filter((m) => m.role === "human" && m.seq > 0 && m.at <= at).map((m) => ({ key: `m:${m.seq}`, at: m.at, text: m.text })),
    ...state.requests.filter((r) => r.at <= at).map((r) => ({ key: `r:${r.at}:${r.communityId}`, at: r.at, text: r.note })),
  ].sort((a, b) => a.at - b.at);
  let terms = baseTerms(state);
  const effects = new Map<string, string | null>();
  for (const request of requests) {
    const result = applyRequest(terms, request.text, ctx);
    terms = result.terms;
    effects.set(request.key, result.summary);
  }
  if (opts.capped && ctx.maxCap !== null && terms.capacity > ctx.maxCap) terms = { ...terms, capacity: ctx.maxCap };
  return { terms, effects };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

interface Step {
  key: string;
  speaker: string | null;
}

function roundMessages(state: EngineState, round: number) {
  return state.messages.filter((m) => m.round === round);
}

function stepMessage(state: EngineState, round: number, key: string): EngineMessage | undefined {
  return roundMessages(state, round).find((m) => m.step === key);
}

/** The next unfinished step of the current round, or null when the round's deal is compiled. */
export function nextStep(state: EngineState): Step | null {
  const round = state.round;
  if (state.compiled[round] !== undefined) return null;
  const done = new Set(roundMessages(state, round).map((m) => m.step).filter(Boolean));
  const lead = state.leadId;
  const active = activePartners(state);
  if (round === 1) {
    if (!done.has("open:lead")) return { key: "open:lead", speaker: lead };
    for (const id of state.partnerIds) {
      if (state.communities[id] && !done.has(`open:${id}`)) return { key: `open:${id}`, speaker: id };
    }
    if (!done.has("propose")) return { key: "propose", speaker: lead };
    for (const id of active) if (!done.has(`reply:${id}`)) return { key: `reply:${id}`, speaker: id };
    const counters = active.filter((id) => stepMessage(state, 1, `reply:${id}`)?.stance === "counter");
    if (counters.length) {
      if (!done.has("revise")) return { key: "revise", speaker: lead };
      for (const id of counters) if (!done.has(`final:${id}`)) return { key: `final:${id}`, speaker: id };
    }
    return { key: "compile", speaker: null };
  }
  if (!done.has(`revise:${round}`)) return { key: `revise:${round}`, speaker: lead };
  for (const id of active) if (!done.has(`reply:${round}:${id}`)) return { key: `reply:${round}:${id}`, speaker: id };
  return { key: "compile", speaker: null };
}

/** Human messages no Bot has answered yet (posted after the last Bot message). */
export function unansweredHumans(state: EngineState): EngineMessage[] {
  const lastBotSeq = Math.max(-1, ...state.messages.filter((m) => m.role === "bot").map((m) => m.seq));
  return state.messages.filter((m) => m.role === "human" && m.seq > 0 && m.seq > lastBotSeq && m.step === null);
}

function mentioned(state: EngineState, text: string, ids: string[]): string | null {
  const mentions = [...text.matchAll(/@([\p{L}\p{N}][\p{L}\p{N}'&.-]*(?:\s[\p{L}\p{N}][\p{L}\p{N}'&.-]*){0,4})/gu)].map((m) => m[1].toLowerCase());
  if (!mentions.length) return null;
  for (const id of ids) {
    const n = name(state, id).toLowerCase();
    if (mentions.some((m) => m.startsWith(n) || n.startsWith(m) || m.startsWith(id))) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function whoSaid(state: EngineState, message: EngineMessage): string {
  return message.communityId ? `${name(state, message.communityId)} organiser` : "organiser";
}

function acknowledgement(state: EngineState, steers: EngineMessage[], trace: TermsTrace): string {
  if (!steers.length) return "";
  const parts = steers.map((m) => {
    const summary = trace.effects.get(`m:${m.seq}`) ?? null;
    return summary ? `${summary}` : null;
  });
  const who = joinNames([...new Set(steers.map((m) => whoSaid(state, m)))]);
  const changes = parts.filter(Boolean);
  return changes.length ? `Noted, ${who}: ${changes.join("; ")}. ` : `Noted, ${who}. `;
}

function planLine(state: EngineState, terms: Terms): string {
  return `${DAY_NAMES[dayOfWeek(terms.date)]} ${shortDate(terms.date).replace(/^\w+ /, "")} at ${terms.time}, ${terms.venue}, for up to ${terms.capacity} people`;
}

/** What should happen next, or null when the engine is waiting on humans. */
export function nextAction(state: EngineState): Action | null {
  const now = state.now.getTime();
  const step = nextStep(state);
  const steers = unansweredHumans(state);

  if (!step) {
    // Round compiled: answer new human messages once, pointing at Renegotiate.
    if (!steers.length) return null;
    const trace = termsAt(state, now, { capped: true });
    return {
      type: "bot",
      step: null,
      communityId: state.leadId,
      stance: null,
      text: `${acknowledgement(state, steers, trace)}The deal is with the organisers for approval now. To change it, ask to renegotiate with a note.`,
      evidence: null,
    };
  }

  const ids = participants(state);
  const mention = steers.length ? mentioned(state, steers[steers.length - 1].text, ids) : null;
  if (mention && mention !== step.speaker) {
    const trace = termsAt(state, now, { capped: state.round > 1 || !!stepMessage(state, 1, "revise") });
    return {
      type: "bot",
      step: null,
      communityId: mention,
      stance: "question",
      text: `${acknowledgement(state, steers, trace)}We'll factor that into the next proposal.`,
      evidence: null,
    };
  }

  if (step.key === "compile") {
    const trace = termsAt(state, now, { capped: true });
    return { type: "compile", round: state.round, deal: compileDeal(state, trace.terms) };
  }

  const revised = state.round > 1 || !!stepMessage(state, 1, "revise") || step.key === "revise";
  const trace = termsAt(state, now, { capped: revised });
  const ack = acknowledgement(state, steers, trace);
  const body = stepText(state, step, trace.terms);
  return { type: "bot", step: step.key, communityId: step.speaker!, stance: body.stance, text: `${ack}${body.text}`, evidence: body.evidence };
}

function stepText(state: EngineState, step: Step, terms: Terms): { text: string; stance: Stance; evidence: string | null } {
  const cats = needCategories(state.need);
  const lead = state.leadId;
  const speaker = step.speaker!;
  const speakerCard = card(state, speaker);
  const seed = `${state.need}:${step.key}`;

  if (step.key === "open:lead") {
    const offer = relevantOffer(speakerCard, cats);
    const asks = cats.length ? joinNames(cats.map((c) => CATEGORY_ASK[c])) : "this";
    const need = sentence(lc(state.need));
    return {
      stance: "question",
      text: `${pick(["Hi all.", "Hello everyone.", "Hi everyone."], seed)} We're planning ${need}. ${offer ? `We can bring ${lc(offer)}. ` : ""}Who can help with ${asks}?`,
      evidence: offer,
    };
  }

  if (step.key.startsWith("open:")) {
    const id = step.key.slice(5);
    if (!activePartners(state).includes(id)) {
      const days = speakerCard.constraints.days.map((d) => DAY_NAMES[d]);
      return {
        stance: "decline",
        text: `We only run on ${joinNames(days)}, and that doesn't overlap with everyone else's days. We'll sit this one out, but keep us in mind for the next one.`,
        evidence: speakerCard.constraints.notes ? stripGuess(speakerCard.constraints.notes) : null,
      };
    }
    const offer = relevantOffer(speakerCard, cats);
    const want = speakerCard.needs[0] ? stripGuess(speakerCard.needs[0]) : null;
    return {
      stance: "offer",
      text: `We can offer ${offer ? lc(offer) : "a hand with promotion"}.${want ? ` In return we'd value ${lc(want)}.` : ""}`,
      evidence: offer,
    };
  }

  if (step.key === "propose") {
    const host = terms.hostId;
    const hostLine = host === lead ? "We host." : `${name(state, host)} hosts.`;
    const others = activePartners(state).filter((id) => id !== host);
    const brings = others
      .slice(0, 2)
      .map((id) => {
        const offer = relevantOffer(card(state, id), cats, "speakers");
        return offer ? `${name(state, id)} brings ${lc(offer)}.` : null;
      })
      .filter(Boolean)
      .join(" ");
    const evidence = host !== lead ? relevantOffer(card(state, host), cats, "space") : relevantOffer(speakerCard, cats);
    return {
      stance: "offer",
      text: `Proposal: ${planLine(state, terms)}. ${hostLine}${brings ? ` ${brings}` : ""} Does that work for everyone?`,
      evidence,
    };
  }

  if (step.key.startsWith("reply:")) {
    const id = step.key.split(":").pop()!;
    const c = card(state, id);
    if (state.round === 1 && c.constraints.maxGroupSize !== null && terms.capacity > c.constraints.maxGroupSize) {
      const max = c.constraints.maxGroupSize;
      return {
        stance: "counter",
        text: `${terms.capacity} people is more than we can take: our limit is ${max}. Can we cap it at ${max}?`,
        evidence: c.constraints.notes ? stripGuess(c.constraints.notes) : null,
      };
    }
    if (state.round > 1) {
      const asked = state.requests.some((r) => r.round === state.round - 1 && r.communityId === id);
      return { stance: "accept", text: asked ? "Thanks, that works for us now." : "Still works for us.", evidence: null };
    }
    const offer = relevantOffer(c, cats, "speakers");
    return {
      stance: "accept",
      text: `${pick(["Works for us.", "That works.", "Happy with that."], seed)}${offer ? ` We'll bring ${lc(offer)}.` : ""}`,
      evidence: offer,
    };
  }

  if (step.key === "revise") {
    const counters = activePartners(state).filter((id) => stepMessage(state, 1, `reply:${id}`)?.stance === "counter");
    const notes = counters.map((id) => card(state, id).constraints.notes).find(Boolean);
    return {
      stance: "offer",
      text: `Fair. Capping it at ${terms.capacity} people. Everything else stays: ${shortDate(terms.date)} at ${terms.time}, ${terms.venue}.`,
      evidence: notes ? stripGuess(notes) : null,
    };
  }

  if (step.key.startsWith("final:")) {
    return { stance: "accept", text: `Agreed. See you on ${shortDate(terms.date)}.`, evidence: null };
  }

  if (step.key.startsWith("revise:")) {
    const asks = state.requests.filter((r) => r.round === state.round - 1);
    const at = state.now.getTime();
    const trace = termsAt(state, at, { capped: true });
    const summaries = asks.map((r) => trace.effects.get(`r:${r.at}:${r.communityId}`)).filter((s): s is string => !!s);
    const who = asks.map((r) => `${name(state, r.communityId)} asked: “${r.note}”`).join(" ");
    const change = summaries.length
      ? `Changes: ${summaries.join("; ")}.`
      : "Nothing in that note changes what the cards allow, so the terms stay.";
    const requesterNotes = asks.map((r) => card(state, r.communityId).constraints.notes).find(Boolean);
    return {
      stance: "offer",
      text: `${who} ${change} The plan is now ${planLine(state, terms)}.`.trim(),
      evidence: requesterNotes ? stripGuess(requesterNotes) : null,
    };
  }

  return { stance: "question", text: "Noted.", evidence: null };
}

// ---------------------------------------------------------------------------
// Deal
// ---------------------------------------------------------------------------

/** "A beginner data workshop for 40 people. We need..." -> "a beginner data workshop" */
function eventPhrase(need: string): string {
  const first = need.split(/[.!?;:](?:\s|$)/)[0] ?? need;
  const phrase = sentence(lc(first))
    .replace(/\s+for\s+(?:up to\s+|about\s+|around\s+)?\d+\s*\w*(?=\s|$)/i, "")
    .replace(/\s+(?:next|this)\s+(?:week|month|term)\b/i, "")
    .trim();
  return phrase || `a ${eventKind(need).toLowerCase()}`;
}

export function eventKind(need: string): string {
  const t = need.toLowerCase();
  if (/\bworkshop/.test(t)) return "Workshop";
  if (/\bhack/.test(t)) return "Hack night";
  if (/\bdemo/.test(t)) return "Demo night";
  if (/\bpanel|\btalks?\b/.test(t)) return "Talks evening";
  if (/\bjam\b/.test(t)) return "Game jam";
  if (/\bplaytest|\bgame/.test(t)) return "Games night";
  if (/\bsocial|\bdrinks|\bmixer|\bparty/.test(t)) return "Social";
  if (/\bconference|\bsummit/.test(t)) return "Mini-conference";
  if (/\bbreakfast/.test(t)) return "Breakfast";
  if (/\bmeetup/.test(t)) return "Meetup";
  return "Joint event";
}

function mainSession(kind: string, speakerName: string | null): string {
  switch (kind) {
    case "Workshop":
      return speakerName ? `Hands-on workshop, led by ${speakerName}` : "Hands-on workshop";
    case "Demo night":
      return "Demos and feedback";
    case "Hack night":
    case "Game jam":
      return "Build in small teams";
    case "Talks evening":
      return speakerName ? `Talks from ${speakerName}` : "Talks";
    case "Games night":
      return "Play and playtest";
    default:
      return speakerName ? `Main session with ${speakerName}` : "Main session";
  }
}

export function compileDeal(state: EngineState, terms: Terms): Deal {
  const ids = participants(state);
  const cats = needCategories(state.need);
  const kind = eventKind(state.need);
  const names = ids.map((id) => name(state, id));
  const title = `${kind}: ${names.join(" × ")}`;
  const canSpeak = (id: string) => id !== terms.hostId && hasCategory(card(state, id), "speakers");
  const speakerId = ids.find((id) => id !== state.leadId && canSpeak(id)) ?? (canSpeak(state.leadId) ? state.leadId : null);

  const communities = ids.map((id) => {
    const c = card(state, id);
    let role: DealRole;
    if (id === terms.hostId) role = "host";
    else if (id === speakerId) role = "speaker";
    else if (id === state.leadId) role = "co-host";
    else role = hasCategory(c, "audience") && !hasCategory(c, "speakers") ? "audience" : "co-host";
    const brings: string[] = [];
    if (id === terms.hostId) {
      const space = relevantOffer(c, cats, "space");
      if (space) brings.push(space);
    }
    const preferred = id === speakerId ? "speakers" : undefined;
    const main = relevantOffer(c, cats, preferred);
    if (main && !brings.includes(main)) brings.push(main);
    if (brings.length === 0) brings.push("Promotion to their members");
    return { id, name: name(state, id), role, brings };
  });

  const start = toMinutes(terms.time);
  const agenda = [
    { time: fromMinutes(start), item: "Doors open and welcome" },
    { time: fromMinutes(start + 20), item: `Introductions from ${joinNames(names)}` },
    { time: fromMinutes(start + 40), item: mainSession(kind, speakerId ? name(state, speakerId) : null) },
    ...terms.extras.map((item, i) => ({ time: fromMinutes(start + 90 + i * 10), item })),
    { time: fromMinutes(start + 120), item: "Wrap-up and next steps" },
  ];

  const hostName = name(state, terms.hostId);
  const description = truncateWords(
    `${joinNames(names)} team up for ${eventPhrase(state.need)}. ${hostName} hosts up to ${terms.capacity} people.`,
    40,
  );

  return {
    title: title.length > 120 ? `${title.slice(0, 117)}…` : title,
    date: terms.date,
    time: terms.time,
    venue: terms.venue,
    capacity: terms.capacity,
    description,
    communities,
    agenda,
    reasons: communities.map((c) => ({ communityId: c.id, evidence: c.brings[0] })),
    consensus: true,
    status: "pending_approval",
  };
}

/** Up to 50 words, in the community's own voice, built only from the deal. */
export function announcementFor(deal: Deal, communityId: string): string {
  const me = deal.communities.find((c) => c.id === communityId);
  const others = deal.communities.filter((c) => c.id !== communityId).map((c) => c.name);
  const bring = me?.brings[0] ? ` We're bringing ${lc(me.brings[0])}.` : "";
  const text = `We're teaming up with ${joinNames(others)} for ${deal.title.split(":")[0].toLowerCase()} on ${shortDate(deal.date)} at ${deal.time}, ${deal.venue}.${bring} Space for ${deal.capacity} people. RSVP on the event page.`;
  return truncateWords(text, 50);
}

// ---------------------------------------------------------------------------
// Simulated organisers
// ---------------------------------------------------------------------------

/** A renegotiation note a simulated organiser would write, from their own card and the deal. */
export function renegotiationNote(c: Card, deal: Deal, allowed: Day[]): string {
  const max = c.constraints.maxGroupSize;
  if (max !== null && deal.capacity > max * 0.7) {
    const n = Math.max(10, roundTo5(max * 0.7));
    if (n < deal.capacity) return `Can we keep it to ${n} people? Our space gets tight above that.`;
  }
  const current = dayOfWeek(deal.date);
  const other = allowed.find((d) => d !== current && (c.constraints.days.length === 0 || c.constraints.days.includes(d)));
  if (other) return `Could we do ${DAY_NAMES[other]} instead? More of our members can make it.`;
  return "Could we start an hour earlier? Most of our members come straight from work.";
}

export function dealAllowedDays(state: EngineState): Day[] {
  return allowedDays(state, participants(state));
}
