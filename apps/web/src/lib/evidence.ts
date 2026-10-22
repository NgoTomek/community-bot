import { findEvidenceField, getCardField, highlightQuote, verifyEvidence, type Card } from "@community-bots/core";

export type EvidenceStatus = "verified" | "unverified" | "no-card" | "none";

export interface EvidenceCheck {
  status: EvidenceStatus;
  quote: string | null;
  /** Community whose card holds the quote (the speaker's own card is checked first). */
  ownerId: string | null;
  /** Card field path that contains the quote, e.g. "offers[1]". */
  field: string | null;
  /** The full text of that field, split for highlighting. */
  segments: { text: string; highlight: boolean }[];
}

/**
 * Recomputes whether a quote is on a card. A stored `verified` flag is never consulted.
 * The preferred card (usually the speaker's) is checked first, then every other card given.
 */
export function checkQuote(
  quote: string | null | undefined,
  preferredId: string | null,
  cards: Record<string, Card | undefined>,
): EvidenceCheck {
  const q = quote?.trim() ? quote.trim() : null;
  if (!q) return { status: "none", quote: null, ownerId: null, field: null, segments: [] };
  const ids = [
    ...(preferredId ? [preferredId] : []),
    ...Object.keys(cards).filter((id) => id !== preferredId),
  ];
  const available = ids.filter((id) => cards[id]);
  if (available.length === 0) return { status: "no-card", quote: q, ownerId: preferredId, field: null, segments: [] };
  for (const id of available) {
    const card = cards[id]!;
    if (!verifyEvidence(q, card)) continue;
    const field = findEvidenceField(q, card);
    const value = field ? getCardField(card, field) : null;
    return {
      status: "verified",
      quote: q,
      ownerId: id,
      field,
      segments: value ? highlightQuote(value, q) : [{ text: q, highlight: true }],
    };
  }
  return { status: "unverified", quote: q, ownerId: preferredId, field: null, segments: [] };
}

/** Counts quotes that verify, for /how-it-works. */
export function countVerified(
  items: { quote: string | null | undefined; ownerId: string | null }[],
  cards: Record<string, Card | undefined>,
): { verified: number; total: number } {
  let verified = 0;
  let total = 0;
  for (const item of items) {
    const result = checkQuote(item.quote, item.ownerId, cards);
    if (result.status === "none") continue;
    total++;
    if (result.status === "verified") verified++;
  }
  return { verified, total };
}
