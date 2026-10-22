import type { Deal } from "@community-bots/core";

export const DEAL_FIELDS = ["title", "date", "time", "venue", "capacity", "description"] as const;
export type DealField = (typeof DEAL_FIELDS)[number];

export interface CommunityChange {
  role?: { before: string; after: string };
  addedBrings: string[];
  removedBrings: string[];
}

export interface DealDiff {
  /** Scalar fields that changed, with their old and new values as display strings. */
  fields: Partial<Record<DealField, { before: string; after: string }>>;
  communities: {
    added: string[];
    removed: string[];
    changed: Record<string, CommunityChange>;
  };
  agenda: { added: string[]; removed: string[] };
  /** Number of individual changes; 0 means the rounds are identical. */
  count: number;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const agendaKey = (a: Deal["agenda"][number]) => `${a.time.trim()} ${a.item.trim()}`;

/** What changed between two rounds of a deal. With no previous round, nothing is "changed". */
export function diffDeals(prev: Deal | null | undefined, next: Deal): DealDiff {
  const diff: DealDiff = {
    fields: {},
    communities: { added: [], removed: [], changed: {} },
    agenda: { added: [], removed: [] },
    count: 0,
  };
  if (!prev) return diff;

  for (const key of DEAL_FIELDS) {
    const before = String(prev[key] ?? "");
    const after = String(next[key] ?? "");
    if (norm(before) !== norm(after)) {
      diff.fields[key] = { before, after };
      diff.count++;
    }
  }

  const prevById = new Map(prev.communities.map((c) => [c.id, c]));
  const nextById = new Map(next.communities.map((c) => [c.id, c]));
  for (const c of next.communities) {
    const old = prevById.get(c.id);
    if (!old) {
      diff.communities.added.push(c.id);
      diff.count++;
      continue;
    }
    const oldBrings = new Set(old.brings.map(norm));
    const newBrings = new Set(c.brings.map(norm));
    const change: CommunityChange = {
      addedBrings: c.brings.filter((b) => !oldBrings.has(norm(b))),
      removedBrings: old.brings.filter((b) => !newBrings.has(norm(b))),
    };
    if (old.role !== c.role) change.role = { before: old.role, after: c.role };
    const n = change.addedBrings.length + change.removedBrings.length + (change.role ? 1 : 0);
    if (n > 0) {
      diff.communities.changed[c.id] = change;
      diff.count += n;
    }
  }
  for (const c of prev.communities) {
    if (!nextById.has(c.id)) {
      diff.communities.removed.push(c.id);
      diff.count++;
    }
  }

  const prevAgenda = new Set(prev.agenda.map((a) => norm(agendaKey(a))));
  const nextAgenda = new Set(next.agenda.map((a) => norm(agendaKey(a))));
  diff.agenda.added = next.agenda.map(agendaKey).filter((k) => !prevAgenda.has(norm(k)));
  diff.agenda.removed = prev.agenda.map(agendaKey).filter((k) => !nextAgenda.has(norm(k)));
  diff.count += diff.agenda.added.length + diff.agenda.removed.length;

  return diff;
}

/** Short human summary, e.g. "date, capacity and 1 agenda item changed". */
export function summarizeDiff(diff: DealDiff): string {
  if (diff.count === 0) return "No changes";
  const parts: string[] = Object.keys(diff.fields);
  const communityChanges =
    diff.communities.added.length + diff.communities.removed.length + Object.keys(diff.communities.changed).length;
  if (communityChanges) parts.push(communityChanges === 1 ? "1 contribution" : `${communityChanges} contributions`);
  // A retimed item shows up as one removal plus one addition: count it once.
  const agendaChanges = Math.max(diff.agenda.added.length, diff.agenda.removed.length);
  if (agendaChanges) parts.push(agendaChanges === 1 ? "1 agenda item" : `${agendaChanges} agenda items`);
  if (parts.length === 1) return `${parts[0]} changed`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]} changed`;
}
