import type { Backend } from "@community-bots/core/backends";
import { DealSchema, type Deal } from "@community-bots/core";
import * as orchestrator from "@community-bots/core/orchestrator";

export function limitWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, max).join(" ");
}

/** One factual sentence from the community name, the deal title, and the date. At most 50 words. */
export function factualAnnouncement(communityName: string, title: string, date: string): string {
  return limitWords(`${communityName}: ${title} on ${date}.`, 50);
}

function normalise(value: unknown): { communityId: string; text: string }[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const items: { communityId: string; text: string }[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const row = entry as { communityId?: unknown; text?: unknown };
    if (typeof row.communityId !== "string" || typeof row.text !== "string") return null;
    const text = limitWords(row.text, 50);
    if (!text) return null;
    items.push({ communityId: row.communityId, text });
  }
  return items;
}

async function fromOrchestrator(backend: Backend, deal: Deal): Promise<{ communityId: string; text: string }[] | null> {
  const bag = orchestrator as typeof orchestrator & Record<string, unknown>;
  const fn = bag.draftAnnouncements ?? bag.writeAnnouncements;
  if (typeof fn !== "function") return null;
  try {
    const result = await (fn as (input: { backend: Backend; deal: Deal }) => Promise<unknown>)({ backend, deal });
    return normalise(result);
  } catch {
    return null;
  }
}

function fromLoose(raw: unknown): { communityId: string; text: string }[] {
  const deal = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const title = typeof deal.title === "string" && deal.title.trim() ? deal.title.trim() : "Joint event";
  const date = typeof deal.date === "string" && deal.date.trim() ? deal.date.trim() : "a later date";
  const communities = Array.isArray(deal.communities) ? deal.communities : [];
  const items: { communityId: string; text: string }[] = [];
  for (const entry of communities) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { id?: unknown; name?: unknown };
    if (typeof row.id !== "string" || typeof row.name !== "string") continue;
    items.push({ communityId: row.id, text: factualAnnouncement(row.name, title, date) });
  }
  return items;
}

/**
 * Announcements for a deal that has none. Uses an orchestrator helper when one is exported,
 * otherwise a short factual sentence per community on the deal.
 */
export async function announcementsForDeal(
  backend: Backend,
  rawDeal: unknown,
): Promise<{ communityId: string; text: string }[]> {
  const parsed = DealSchema.safeParse(rawDeal);
  if (parsed.success) {
    const drafted = await fromOrchestrator(backend, parsed.data);
    if (drafted) return drafted;
    return parsed.data.communities.map((community) => ({
      communityId: community.id,
      text: factualAnnouncement(community.name, parsed.data.title, parsed.data.date),
    }));
  }
  return fromLoose(rawDeal);
}
