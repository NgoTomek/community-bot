import type { Fit, MatchCandidate } from "@community-bots/core";

export type RankChange = { kind: "new" } | { kind: "same" } | { kind: "up"; places: number } | { kind: "down"; places: number };

export interface CurrentRow {
  candidate: MatchCandidate;
  /** 1-based position in this run. */
  rank: number;
  previousRank: number | null;
  /** Null when there is no previous run to compare with. */
  change: RankChange | null;
  /** The previous fit, only when it changed. */
  fitBefore: Fit | null;
}

export interface PreviousRow {
  candidate: MatchCandidate;
  rank: number;
  /** Position in this run, or null when the community dropped out. */
  currentRank: number | null;
  dropped: boolean;
}

export interface MatchDiff {
  hasPrevious: boolean;
  current: CurrentRow[];
  previous: PreviousRow[];
  added: string[];
  dropped: string[];
  moved: string[];
  fitChanged: string[];
  /** Number of differences; 0 means the same ranking. */
  count: number;
}

/** Keeps the first entry per community, so a repeated id never counts twice. */
function unique(candidates: MatchCandidate[]): MatchCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.communityId)) return false;
    seen.add(c.communityId);
    return true;
  });
}

/**
 * Compares two Matchmaker runs by position: who is new, who dropped out,
 * who moved up or down (and by how many places), and whose fit changed.
 */
export function diffMatches(previous: MatchCandidate[] | null | undefined, current: MatchCandidate[]): MatchDiff {
  const now = unique(current);
  const before = previous ? unique(previous) : null;
  const beforeRank = new Map((before ?? []).map((c, i) => [c.communityId, { rank: i + 1, fit: c.fit }]));
  const nowRank = new Map(now.map((c, i) => [c.communityId, i + 1]));
  const diff: MatchDiff = { hasPrevious: !!before, current: [], previous: [], added: [], dropped: [], moved: [], fitChanged: [], count: 0 };

  now.forEach((candidate, i) => {
    const rank = i + 1;
    const old = beforeRank.get(candidate.communityId);
    let change: RankChange | null = null;
    let fitBefore: Fit | null = null;
    if (before) {
      if (!old) {
        change = { kind: "new" };
        diff.added.push(candidate.communityId);
      } else if (old.rank === rank) {
        change = { kind: "same" };
      } else {
        change = old.rank > rank ? { kind: "up", places: old.rank - rank } : { kind: "down", places: rank - old.rank };
        diff.moved.push(candidate.communityId);
      }
      if (old && old.fit !== candidate.fit) {
        fitBefore = old.fit;
        diff.fitChanged.push(candidate.communityId);
      }
    }
    diff.current.push({ candidate, rank, previousRank: old?.rank ?? null, change, fitBefore });
  });

  (before ?? []).forEach((candidate, i) => {
    const currentRank = nowRank.get(candidate.communityId) ?? null;
    if (currentRank === null) diff.dropped.push(candidate.communityId);
    diff.previous.push({ candidate, rank: i + 1, currentRank, dropped: currentRank === null });
  });

  diff.count = diff.added.length + diff.dropped.length + diff.moved.length + diff.fitChanged.length;
  return diff;
}

/** "1 new, 1 dropped, 2 moved and 1 fit changed" or "Same ranking as the previous run". */
export function summarizeMatchDiff(diff: MatchDiff): string {
  if (!diff.hasPrevious) return "";
  if (diff.count === 0) return "Same ranking as the previous run";
  const parts: string[] = [];
  if (diff.added.length) parts.push(`${diff.added.length} new`);
  if (diff.dropped.length) parts.push(`${diff.dropped.length} dropped`);
  if (diff.moved.length) parts.push(`${diff.moved.length} moved`);
  if (diff.fitChanged.length) parts.push(`${diff.fitChanged.length} ${diff.fitChanged.length === 1 ? "fit" : "fits"} changed`);
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
