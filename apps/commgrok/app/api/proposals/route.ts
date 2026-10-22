import { handle, hasApiKey, json, readJson } from "@/lib/api";
import { createProposal, eventJson, HttpError, loadEventContext, loadInbox } from "@/lib/workflow";
import { eventInputSchema, zodMessage } from "@/lib/validation";
import { getSiteUrl } from "@/lib/site";
import { OPEN_STATUSES, normalizeStatus, type EventStatus } from "@/lib/types";

const ALL_STATUSES: EventStatus[] = ["proposed", "renegotiating", "rejected", "published", "cancelled"];

function requireKey(req: Request) {
  if (!process.env.PROPOSALS_API_KEY) throw new HttpError(500, "PROPOSALS_API_KEY is not configured on the server");
  if (!hasApiKey(req)) throw new HttpError(401, "Missing or wrong X-API-Key");
}

/**
 * Bot integration: create an event proposal.
 * Auth: X-API-Key header must equal PROPOSALS_API_KEY.
 * Both teams are required by default (override with required_team_ids).
 */
export function POST(req: Request) {
  return handle(async () => {
    requireKey(req);
    const parsed = eventInputSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
    const ev = await createProposal(parsed.data, "bot", "Community bot");
    const site = await getSiteUrl();
    const ctx = await loadEventContext(ev);
    return json(eventJson(ev, site, ctx.approval, ctx.rsvp), 201);
  });
}

/**
 * Bot polling: GET /api/proposals?status=renegotiating (comma-separated; default: all open).
 * -> { items: [eventJson + approvals + latest_note] }, newest organiser note first.
 */
export function GET(req: Request) {
  return handle(async () => {
    requireKey(req);
    const raw = new URL(req.url).searchParams.get("status");
    const wanted = raw
      ? raw.split(",").map((s) => normalizeStatus(s.trim())).filter(Boolean)
      : OPEN_STATUSES;
    const bad = wanted.filter((s) => !ALL_STATUSES.includes(s));
    if (bad.length) throw new HttpError(400, `Unknown status: ${bad.join(", ")}. Use ${ALL_STATUSES.join(" | ")}`);
    const site = await getSiteUrl();
    const rows = wanted.includes("cancelled") ? null : await loadInbox();
    const source = rows ?? (await loadAll());
    const items = source
      .filter((r) => wanted.includes(r.event.status))
      .sort((a, b) => {
        const an = a.latestNote?.at ?? "";
        const bn = b.latestNote?.at ?? "";
        if (an !== bn) return bn.localeCompare(an);
        return b.event.created_at.localeCompare(a.event.created_at);
      })
      .map((r) => eventJson(r.event, site, r.approval, undefined, r.latestNote));
    return json({ items });
  });
}

/** Like loadInbox, but including cancelled events. */
async function loadAll() {
  const { getStore } = await import("@/lib/store");
  const events = await getStore().listEvents();
  return Promise.all(
    events.map(async (event) => {
      const ctx = await loadEventContext(event);
      return { event, approval: ctx.approval, latestNote: ctx.latestNote };
    }),
  );
}
