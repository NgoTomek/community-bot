import { handle, json, requireSession } from "@/lib/api";
import { cancelEvent, findEvent, HttpError } from "@/lib/workflow";

/**
 * Team members: cancel a PUBLISHED event (the public page then shows "Cancelled").
 * Open proposals are rejected instead, never cancelled: a cancelled event is public,
 * so cancelling a proposal would expose something nobody approved.
 */
export function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireSession();
    const { id } = await params;
    const ev = await findEvent(id);
    if (!ev) throw new HttpError(404, "Event not found");
    if (ev.status === "cancelled") return json({ status: ev.status });
    if (ev.status !== "published") throw new HttpError(409, `Only published events can be cancelled. This one is ${ev.status}; reject it instead.`);
    const updated = await cancelEvent(ev.id, session);
    return json({ status: updated.status });
  });
}
