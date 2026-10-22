import { CardSchema, MatchCandidateSchema, formatZodError, type Card, type MatchCandidate } from "@community-bots/core";

export function readDraftCard(result: unknown): { card: Card | null; backend: string | null; problem: string | null } {
  if (!result || typeof result !== "object") {
    return { card: null, backend: null, problem: "The job finished without a card." };
  }
  const row = result as Record<string, unknown>;
  const backend = typeof row.backend === "string" ? row.backend : null;
  const parsed = CardSchema.safeParse(row.card);
  if (!parsed.success) return { card: null, backend, problem: formatZodError(parsed.error) };
  return { card: parsed.data, backend, problem: null };
}

export function readMatch(result: unknown): {
  backend: string | null;
  need: string | null;
  candidates: MatchCandidate[];
  dropped: number;
} | null {
  if (!result || typeof result !== "object") return null;
  const row = result as Record<string, unknown>;
  const raw = Array.isArray(row.candidates) ? row.candidates : null;
  if (!raw) return null;
  const candidates = raw.flatMap((item) => {
    const parsed = MatchCandidateSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  return {
    backend: typeof row.backend === "string" ? row.backend : null,
    need: typeof row.need === "string" ? row.need : null,
    candidates,
    dropped: raw.length - candidates.length,
  };
}

export function readBackend(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const backend = (result as { backend?: unknown }).backend;
  return typeof backend === "string" ? backend : null;
}
