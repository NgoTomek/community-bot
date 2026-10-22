import { MatchCandidateSchema, type MatchCandidate } from "@community-bots/core";
import type { StorageLike } from "../../lib/identity";

/** One Matchmaker run from a community profile's "Try it" panel. */
export interface MatchSnapshot {
  jobId: string;
  need: string;
  at: string;
  backend: string | null;
  candidates: MatchCandidate[];
}

export interface MatchHistory {
  latest: MatchSnapshot | null;
  previous: MatchSnapshot | null;
}

export const EMPTY_HISTORY: MatchHistory = { latest: null, previous: null };
export const MATCH_HISTORY_PREFIX = "cb.match.";

/** Valid candidates only, from a job result or storage. */
export function readCandidates(raw: unknown): MatchCandidate[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c) => {
    const parsed = MatchCandidateSchema.safeParse(c);
    return parsed.success ? [parsed.data] : [];
  });
}

function readSnapshot(raw: unknown): MatchSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.jobId !== "string" || typeof s.need !== "string" || typeof s.at !== "string" || !Array.isArray(s.candidates)) return null;
  return { jobId: s.jobId, need: s.need, at: s.at, backend: typeof s.backend === "string" ? s.backend : null, candidates: readCandidates(s.candidates) };
}

/** Results kept for this tab, per community. Anything unreadable is ignored. */
export function loadMatchHistory(storage: StorageLike | null, communityId: string): MatchHistory {
  if (!storage) return EMPTY_HISTORY;
  try {
    const raw = storage.getItem(MATCH_HISTORY_PREFIX + communityId);
    if (!raw) return EMPTY_HISTORY;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const latest = readSnapshot(parsed.latest);
    return { latest, previous: latest ? readSnapshot(parsed.previous) : null };
  } catch {
    return EMPTY_HISTORY;
  }
}

export function saveMatchHistory(storage: StorageLike | null, communityId: string, history: MatchHistory): void {
  if (!storage) return;
  try {
    if (!history.latest) storage.removeItem(MATCH_HISTORY_PREFIX + communityId);
    else storage.setItem(MATCH_HISTORY_PREFIX + communityId, JSON.stringify(history));
  } catch {
    /* storage full or blocked: results last for this page only */
  }
}

/** The new run becomes the latest and the old latest becomes the previous. Same job twice is a no-op. */
export function pushMatchSnapshot(history: MatchHistory, snapshot: MatchSnapshot): MatchHistory {
  if (history.latest?.jobId === snapshot.jobId) return history;
  return { latest: snapshot, previous: history.latest };
}
