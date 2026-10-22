import type { Card, Evidence } from "./schemas";

export interface CardEntry {
  /** Field path, e.g. "tagline", "offers[1]", "runs[0].event", "constraints.notes". */
  path: string;
  value: string;
}

/** Every string value on the card with its path, in a stable order. */
export function flattenCardEntries(card: Card): CardEntry[] {
  const entries: CardEntry[] = [];
  const walk = (value: unknown, path: string) => {
    if (typeof value === "string") {
      entries.push({ path, value });
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) walk(child, path ? `${path}.${key}` : key);
    }
  };
  walk(card, "");
  return entries;
}

/** All string values on the card joined with newlines. Evidence must be a substring of this. */
export function flattenCard(card: Card): string {
  return flattenCardEntries(card)
    .map((entry) => entry.value)
    .join("\n");
}

const QUOTE_CHARS = /["'`\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u00AB\u00BB\u2039\u203A\u00B4]/g;

/**
 * Case-insensitive, whitespace- and quote-normalised form used for evidence matching.
 * Quote characters are dropped entirely so "Founders' nights" matches “Founders’ nights”.
 */
export function normaliseText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(QUOTE_CHARS, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strips wrapping quotes, ellipses and trailing punctuation a Bot may add around a quote. */
function normaliseQuote(quote: string): string {
  return normaliseText(quote)
    .replace(/^(\.\.\.|[\s.,;:!?-])+/, "")
    .replace(/(\.\.\.|[\s.,;:!?-])+$/, "")
    .trim();
}

const MIN_QUOTE_LENGTH = 3;

/** True when the quote appears on the card (case-, whitespace- and quote-insensitive). */
export function verifyEvidence(quote: string | null | undefined, card: Card): boolean {
  if (!quote) return false;
  const needle = normaliseQuote(quote);
  if (needle.length < MIN_QUOTE_LENGTH) return false;
  return normaliseText(flattenCard(card)).includes(needle);
}

/** The path of the first card field containing the quote, or null if none does. */
export function findEvidenceField(quote: string | null | undefined, card: Card): string | null {
  if (!quote) return null;
  const needle = normaliseQuote(quote);
  if (needle.length < MIN_QUOTE_LENGTH) return null;
  const hit = flattenCardEntries(card).find((entry) => normaliseText(entry.value).includes(needle));
  return hit?.path ?? null;
}

/** Builds the stored evidence object for a quote, or null when there is no quote. */
export function checkEvidence(quote: string | null | undefined, card: Card): Evidence | null {
  if (!quote || !quote.trim()) return null;
  return { quote: quote.trim(), verified: verifyEvidence(quote, card), field: findEvidenceField(quote, card) };
}

/** Reads a field path like "offers[1]" or "constraints.notes" from a card. */
export function getCardField(card: Card, path: string): string | null {
  const parts = path.match(/[^.[\]]+/g) ?? [];
  let value: unknown = card;
  for (const part of parts) {
    if (value === null || value === undefined) return null;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === "string" ? value : null;
}

/**
 * Splits `text` into segments so a UI can highlight where `quote` occurs.
 * Matching uses the same normalisation as verifyEvidence; falls back to no highlight.
 */
export function highlightQuote(text: string, quote: string): { text: string; highlight: boolean }[] {
  const needle = normaliseQuote(quote);
  if (needle.length < MIN_QUOTE_LENGTH) return [{ text, highlight: false }];
  // Map each normalised character back to the start index of its original code point.
  // Walk by code point so multi-byte chars (and expansions like … → "...") stay aligned.
  const map: number[] = [];
  let normalised = "";
  let i = 0;
  while (i < text.length) {
    const char = String.fromCodePoint(text.codePointAt(i)!);
    const piece = normaliseText(char) || (/\s/.test(char) ? " " : "");
    for (const ch of piece) {
      if (ch === " " && normalised.endsWith(" ")) continue;
      normalised += ch;
      map.push(i);
    }
    i += char.length;
  }
  const start = normalised.indexOf(needle);
  if (start < 0) return [{ text, highlight: false }];
  const from = map[start];
  const lastStart = map[start + needle.length - 1];
  const lastChar = String.fromCodePoint(text.codePointAt(lastStart)!);
  const to = lastStart + lastChar.length;
  return [
    { text: text.slice(0, from), highlight: false },
    { text: text.slice(from, to), highlight: true },
    { text: text.slice(to), highlight: false },
  ].filter((segment) => segment.text.length > 0);
}
