import {
  BACKENDS,
  CardSchema,
  DAYS,
  flattenCardEntries,
  formatZodError,
  GUESS_PREFIX,
  isGuess,
  LIMITS,
  normaliseCard,
  slugify,
  type BackendName,
  type Card,
  type Day,
} from "@community-bots/core";

export interface ListItem {
  key: string;
  text: string;
}

export interface RunItem {
  key: string;
  event: string;
  frequency: string;
}

/**
 * Editable form state for a card. Text keeps its "GUESS: " prefix until a human checks it;
 * an empty string means unknown (null on the card).
 */
export interface CardDraft {
  name: string;
  tagline: string;
  location: string;
  members: string;
  tone: string;
  runs: RunItem[];
  offers: ListItem[];
  needs: ListItem[];
  days: Day[];
  maxGroupSize: string;
  notes: string;
  sourceUrls: string[];
}

let lastKey = 0;

/** Stable React key for a list row, so removing a row never shifts another row's input. */
export function rowKey(): string {
  lastKey += 1;
  return `row-${lastKey}`;
}

// ---------------------------------------------------------------------------
// GUESS helpers
// ---------------------------------------------------------------------------

/** The text without the GUESS prefix. */
export function stripGuess(value: string): string {
  return isGuess(value) ? value.slice(GUESS_PREFIX.length) : value;
}

/** "Mark as checked": the same text, no longer a guess. */
export function markChecked(value: string): string {
  return stripGuess(value);
}

/** True when nothing is left once the GUESS prefix and whitespace are gone. */
export function isBlank(value: string | null | undefined): boolean {
  return !value || stripGuess(value).trim() === "";
}

/** Number of guessed values on a card (source links do not count). */
export function cardGuessCount(card: Card): number {
  return flattenCardEntries(card).filter((entry) => entry.path !== "id" && !entry.path.startsWith("sourceUrls") && isGuess(entry.value)).length;
}

/** Number of guessed, non-empty values still in a draft. */
export function draftGuessCount(draft: CardDraft): number {
  const values = [
    draft.name,
    draft.tagline,
    draft.location,
    draft.members,
    draft.tone,
    draft.notes,
    ...draft.offers.map((o) => o.text),
    ...draft.needs.map((n) => n.text),
    ...draft.runs.flatMap((r) => [r.event, r.frequency]),
  ];
  return values.filter((v) => isGuess(v) && !isBlank(v)).length;
}

// ---------------------------------------------------------------------------
// Draft <-> Card
// ---------------------------------------------------------------------------

/** Trims the text and keeps a leading GUESS prefix intact. */
function clean(value: string): string {
  const text = value.trim();
  return isGuess(text) ? `${GUESS_PREFIX}${stripGuess(text).trim()}` : text;
}

const optional = (value: string): string | null => (isBlank(value) ? null : clean(value));

export function cardToDraft(card: Card): CardDraft {
  return {
    name: card.name,
    tagline: card.tagline ?? "",
    location: card.location ?? "",
    members: card.members ?? "",
    tone: card.tone ?? "",
    runs: card.runs.map((r) => ({ key: rowKey(), event: r.event, frequency: r.frequency ?? "" })),
    offers: card.offers.map((text) => ({ key: rowKey(), text })),
    needs: card.needs.map((text) => ({ key: rowKey(), text })),
    days: DAYS.filter((d) => card.constraints.days.includes(d)),
    maxGroupSize: card.constraints.maxGroupSize === null ? "" : String(card.constraints.maxGroupSize),
    notes: card.constraints.notes ?? "",
    sourceUrls: [...card.sourceUrls],
  };
}

/** "" is no limit; anything that is not a whole number becomes NaN so validation rejects it. */
export function parseGroupSize(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  return /^\d+$/.test(text) ? Number(text) : Number.NaN;
}

/** The id of a new card: derived from its name, never typed by hand. */
export function idFromName(name: string): string {
  return slugify(stripGuess(name));
}

/** Row keys of the draft items that made it onto the card (blank rows are skipped). */
interface DraftIndex {
  runs: string[];
  offers: string[];
  needs: string[];
}

function buildCard(draft: CardDraft, id: string): { card: Card; index: DraftIndex } {
  const runs = draft.runs.filter((r) => !isBlank(r.event) || !isBlank(r.frequency));
  const offers = draft.offers.filter((o) => !isBlank(o.text));
  const needs = draft.needs.filter((n) => !isBlank(n.text));
  const card: Card = {
    id,
    name: isBlank(draft.name) ? "" : clean(draft.name),
    tagline: optional(draft.tagline),
    location: optional(draft.location),
    members: optional(draft.members),
    runs: runs.map((r) => ({ event: isBlank(r.event) ? "" : clean(r.event), frequency: optional(r.frequency) })),
    offers: offers.map((o) => clean(o.text)),
    needs: needs.map((n) => clean(n.text)),
    constraints: {
      days: DAYS.filter((d) => draft.days.includes(d)),
      maxGroupSize: parseGroupSize(draft.maxGroupSize),
      notes: optional(draft.notes),
    },
    tone: optional(draft.tone),
    sourceUrls: [...draft.sourceUrls],
  };
  return { card, index: { runs: runs.map((r) => r.key), offers: offers.map((o) => o.key), needs: needs.map((n) => n.key) } };
}

/** The card a draft would save. Blank rows are left out; text is trimmed. */
export function draftToCard(draft: CardDraft, id: string): Card {
  return buildCard(draft, id).card;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface DraftCheck {
  card: Card;
  valid: boolean;
  /** Readable messages keyed by field: "name", "maxGroupSize", `offer:${key}`, `run:${key}:event`, ... */
  errors: Record<string, string>;
  /** formatZodError output when a problem has no field on screen to show it, else null. */
  other: string | null;
}

function fieldKey(path: PropertyKey[], index: DraftIndex, idFollowsName: boolean): string | null {
  const [head, second, third] = path;
  const rowAt = (keys: string[]) => (typeof second === "number" ? keys[second] : undefined);
  switch (head) {
    case "name":
      return "name";
    case "id":
      return idFollowsName ? "name" : null;
    case "tagline":
    case "location":
    case "members":
    case "tone":
      return head;
    case "runs": {
      const key = rowAt(index.runs);
      return key ? `run:${key}:${third === "frequency" ? "frequency" : "event"}` : null;
    }
    case "offers": {
      const key = rowAt(index.offers);
      return key ? `offer:${key}` : null;
    }
    case "needs": {
      const key = rowAt(index.needs);
      return key ? `need:${key}` : null;
    }
    case "constraints":
      return second === "days" || second === "maxGroupSize" || second === "notes" ? second : null;
    default:
      return null;
  }
}

function readable(key: string, fallback: string): string {
  if (key === "name") return "Give the community a name (up to 120 characters).";
  if (key === "maxGroupSize") return "Use a whole number above 0, or leave it empty for no limit.";
  if (key.startsWith("run:") && key.endsWith(":event")) return "Name the event, or clear this row.";
  return fallback;
}

/**
 * Validates what the draft would save against CardSchema, as the user types.
 * `idFollowsName` is true for new cards, whose id is derived from the name.
 */
export function checkDraft(draft: CardDraft, id: string, idFollowsName: boolean): DraftCheck {
  const { card, index } = buildCard(draft, id);
  const parsed = CardSchema.safeParse(card);
  if (parsed.success) return { card: parsed.data, valid: true, errors: {}, other: null };
  const errors: Record<string, string> = {};
  let unplaced = false;
  for (const issue of parsed.error.issues) {
    const key = fieldKey(issue.path, index, idFollowsName);
    if (!key) {
      unplaced = true;
      continue;
    }
    errors[key] ??= readable(key, issue.message);
  }
  return { card, valid: false, errors, other: unplaced ? formatZodError(parsed.error) : null };
}

const canonical = (c: Card): Card => ({
  id: c.id,
  name: c.name,
  tagline: c.tagline,
  location: c.location,
  members: c.members,
  runs: c.runs.map((r) => ({ event: r.event, frequency: r.frequency })),
  offers: c.offers,
  needs: c.needs,
  constraints: { days: c.constraints.days, maxGroupSize: c.constraints.maxGroupSize, notes: c.constraints.notes },
  tone: c.tone,
  sourceUrls: c.sourceUrls,
});

/** Same content, whatever the key order. */
export function sameCard(a: Card, b: Card): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

// ---------------------------------------------------------------------------
// Job result and links
// ---------------------------------------------------------------------------

export type DraftResult = { ok: true; card: Card; backend: BackendName | null } | { ok: false; error: string };

/** Reads a draft_card job result defensively: real backends may send loosely-shaped cards. */
export function readDraftResult(result: unknown): DraftResult {
  const obj = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  const backend = typeof obj.backend === "string" && (BACKENDS as readonly string[]).includes(obj.backend) ? (obj.backend as BackendName) : null;
  if (!obj.card || typeof obj.card !== "object") return { ok: false, error: "The Scout Bot finished without a card. Try again, or try another link." };
  const parsed = CardSchema.safeParse(obj.card);
  if (parsed.success) return { ok: true, card: parsed.data, backend };
  try {
    return { ok: true, card: normaliseCard(obj.card), backend };
  } catch {
    return { ok: false, error: `The Scout Bot sent back a card this page cannot read (${formatZodError(parsed.error)}).` };
  }
}

const NOT_A_LINK = "That does not look like a web address. Try something like https://example.org/your-community";

/** Accepts "example.org/club" as well as full links. Returns the link to send, or a readable error. */
export function normaliseUrl(input: string): { url: string } | { error: string } {
  let text = input.trim();
  if (!text) return { error: "Paste a link to a public page about your community." };
  if (/\s/.test(text)) return { error: "Links cannot contain spaces. Check what you pasted." };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { error: NOT_A_LINK };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { error: "Use a link that starts with https:// or http://" };
  if (!parsed.hostname.includes(".") || parsed.hostname.startsWith(".") || parsed.hostname.endsWith(".")) return { error: NOT_A_LINK };
  if (text.length > LIMITS.url) return { error: `That link is too long. Use one under ${LIMITS.url} characters.` };
  return { url: text };
}

/** Only http(s) links are ever rendered as links; anything else stays plain text. */
export function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/** "https://www.example.org/club/" -> "example.org/club" */
export function linkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.hostname.replace(/^www\./, "")}${path}${parsed.search}`;
  } catch {
    return url;
  }
}
