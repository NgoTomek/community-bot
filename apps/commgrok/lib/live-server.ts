import { LIVE_CHANNEL, isSupabaseMode } from "./config";

/**
 * Tell every open screen that something changed.
 * Supabase mode: a Realtime broadcast (REST endpoint, no socket needed on the server).
 * Local mode: nothing to do, /api/live watches the local store's version counter.
 */
export async function notifyChange(eventId?: string, kind = "change") {
  if (!isSupabaseMode()) return;
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic: LIVE_CHANNEL, event: "change", payload: { eventId, kind, at: Date.now() } }] }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) {
    console.warn("[live] broadcast failed", e);
  }
}
