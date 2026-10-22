import type { Deal } from "@community-bots/core";

/** Fields a later pass can POST to Luma. Built only from the deal. */
export type LumaPayload = {
  title: string;
  date: string;
  time: string;
  venue: string;
  capacity: number;
  description: string;
  communities: { id: string; name: string; role: string; brings: string[] }[];
};

export function lumaPayload(deal: Deal): LumaPayload {
  return {
    title: deal.title,
    date: deal.date,
    time: deal.time,
    venue: deal.venue,
    capacity: deal.capacity,
    description: deal.description,
    communities: deal.communities.map((community) => ({
      id: community.id,
      name: community.name,
      role: community.role,
      brings: community.brings,
    })),
  };
}

/**
 * TODO: create the Luma event and return its id and public URL.
 * Do not add the HTTP call in this pass. Callers must not invoke this until it is filled in.
 */
export async function publishToLuma(
  apiKey: string,
  payload: LumaPayload,
): Promise<{ luma_event_id: string; url: string }> {
  if (!apiKey.trim()) throw new Error("LUMA_API_KEY is not set");
  void payload;
  throw new Error("TODO: publish to Luma");
}

/** Stays false until publishToLuma performs the real request. The worker must not call the network before then. */
export function shouldPublishToLuma(): boolean {
  return false;
}
