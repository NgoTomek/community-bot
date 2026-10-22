import { handle, json, readJson, requireSession } from "@/lib/api";
import { decide, HttpError } from "@/lib/workflow";
import { decisionSchema, zodMessage } from "@/lib/validation";
import { getSiteUrl } from "@/lib/site";

/**
 * Organiser decision: { decision: "approved" | "rejected" | "renegotiate", note? }.
 * The team always comes from the session, never from the body.
 * -> { status, justPublished, url, slug }
 */
export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireSession();
    const { id } = await params;
    const parsed = decisionSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
    const site = await getSiteUrl();
    const { event, justPublished } = await decide(id, parsed.data.decision, parsed.data.note, session, site);
    return json({ status: event.status, justPublished, url: `${site}/e/${event.slug}`, slug: event.slug });
  });
}
