import { handle, hasApiKey, json } from "@/lib/api";
import { notifyChange } from "@/lib/live-server";
import { getStore } from "@/lib/store";
import { getSession } from "@/lib/session";
import { HttpError } from "@/lib/workflow";

/** Wipe and re-seed the demo data (local JSON store or Supabase). Needs a team session or the API key. */
export function POST(req: Request) {
  return handle(async () => {
    if (!hasApiKey(req) && !(await getSession())?.teamId) throw new HttpError(401, "Not allowed");
    const store = getStore();
    if (!store.reset) throw new HttpError(400, "This store can't be reset. Re-run supabase/seed.sql instead.");
    await store.reset();
    // Supabase mode: tell open screens to refresh (local mode: no-op, /api/live sees the version bump).
    await notifyChange(undefined, "reset");
    return json({ ok: true });
  });
}
