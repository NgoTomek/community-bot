import { handle, hasApiKey, json, readJson } from "@/lib/api";
import { eventJson, HttpError, loadEventContext, reviseProposal } from "@/lib/workflow";
import { revisionSchema, zodMessage } from "@/lib/validation";
import { getSiteUrl } from "@/lib/site";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Bot integration: send a revised version of a proposal (usually after an organiser sent it back).
 * Auth: X-API-Key. Body: any subset of the event fields + optional `message`. Accepts an id or slug.
 * Bumps the revision (every approval resets) and sets status back to "proposed".
 * 404 missing, 409 if rejected/published/cancelled.
 * -> eventJson + approvals + latest_note + { changed: string[], changes: {label: {from, to}}, responded_to: string | null }
 */
export function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    if (!process.env.PROPOSALS_API_KEY) throw new HttpError(500, "PROPOSALS_API_KEY is not configured on the server");
    if (!hasApiKey(req)) throw new HttpError(401, "Missing or wrong X-API-Key");
    const { id } = await params;
    const parsed = revisionSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
    const { event, changed, changes, respondedTo } = await reviseProposal(id, parsed.data, "Bot");
    const site = await getSiteUrl();
    const ctx = await loadEventContext(event);
    return json({
      ...eventJson(event, site, ctx.approval, ctx.rsvp, ctx.latestNote),
      changed,
      changes,
      responded_to: respondedTo,
    });
  });
}
