import { handle, hasApiKey, json, readJson, requireSession } from "@/lib/api";
import { editEvent, eventJson, findEvent, HttpError, loadEventContext } from "@/lib/workflow";
import { eventPatchSchema, zodMessage } from "@/lib/validation";
import { getSiteUrl } from "@/lib/site";
import { getSession } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Bot polling: event + status + approvals.teams[] (state, note) + latest_note + RSVP counts.
 * Accepts an id or a slug. Published events are public; everything else needs X-API-Key or a team session.
 */
export function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const ev = await findEvent(id);
    if (!ev) throw new HttpError(404, "Event not found");
    if (ev.status !== "published" && !hasApiKey(req) && !(await getSession())?.teamId) throw new HttpError(401, "Missing or wrong X-API-Key");
    const ctx = await loadEventContext(ev);
    return json(eventJson(ev, await getSiteUrl(), ctx.approval, ctx.rsvp, ctx.latestNote));
  });
}

/** Team members: edit a proposal. Any change resets earlier approvals. */
export function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireSession();
    const { id } = await params;
    const parsed = eventPatchSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
    const ev = await findEvent(id);
    if (!ev) throw new HttpError(404, "Event not found");
    const { event, changed, changes } = await editEvent(ev.id, parsed.data, session);
    return json({ id: event.id, slug: event.slug, status: event.status, revision: event.revision, changed, changes });
  });
}
